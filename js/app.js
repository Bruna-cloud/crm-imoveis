/**
 * ============================================================================
 * LÓGICA PRINCIPAL DO CRM - ANDRESSA SPAGNOL IMÓVEIS
 * ============================================================================
 */

import { STATUS_FUNIL, STATUS_MARKETING } from "./config.js";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { criarPastaDriveImovel } from "./driveService.js";

// Estado em memória da aplicação
const state = {
  user: null,
  activeTab: "clientes", // 'clientes' | 'imoveis'
  clientesView: "kanban", // 'kanban' | 'lista'
  filtroImoveis: "ativos", // 'ativos' | 'todos'
  clientes: [],
  imoveis: []
};

// ============================================================================
// UTILITÁRIOS DE FORMATAÇÃO E UI
// ============================================================================

function formatarMoeda(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarDataCurta(isoString) {
  if (!isoString) return "";
  const data = new Date(isoString);
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function limparTelefoneWhatsApp(telefone) {
  const digitos = (telefone || "").replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

function aplicarMascaraTelefone(valor) {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function showToast(mensagem, tipo = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensagem;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 300);
  }, 4200);
}

// ============================================================================
// 1. MÓDULO DE AUTENTICAÇÃO (SUPABASE AUTH)
// ============================================================================

async function inicializarAutenticacao() {
  const configAlert = document.getElementById("config-warning");
  if (!isSupabaseConfigured()) {
    configAlert?.classList.remove("hidden");
  }

  // Verificar sessão atual
  const { data, error } = await supabase.auth.getSession();
  if (!error && data?.session?.user) {
    atualizarEstadoAutenticado(data.session.user);
  } else {
    atualizarEstadoAutenticado(null);
  }

  // Escutar mudanças de sessão (login, logout, expiração de token)
  supabase.auth.onAuthStateChange((_event, session) => {
    atualizarEstadoAutenticado(session?.user || null);
  });
}

function atualizarEstadoAutenticado(user) {
  state.user = user;
  const authScreen = document.getElementById("auth-screen");
  const crmScreen = document.getElementById("crm-screen");
  const userEmailBadge = document.getElementById("user-email-badge");

  if (user) {
    // Usuário autenticado -> Oculta login e renderiza painel do CRM
    authScreen.classList.add("hidden");
    crmScreen.classList.remove("hidden");
    if (userEmailBadge) {
      userEmailBadge.textContent = user.email;
    }
    carregarDadosIniciais();
  } else {
    // Não autenticado -> Garante que o CRM não fique acessível
    state.clientes = [];
    state.imoveis = [];
    crmScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (!isSupabaseConfigured()) {
    showToast(
      "Configure SUPABASE_URL e SUPABASE_KEY no arquivo js/config.js antes de fazer login.",
      "error"
    );
    return;
  }

  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const btnLogin = document.getElementById("btn-login");
  const loginError = document.getElementById("login-error");

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  loginError.classList.add("hidden");
  btnLogin.disabled = true;
  btnLogin.textContent = "Autenticando...";

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    passwordInput.value = "";
    showToast("Bem-vindo(a) ao CRM Andressa Spagnol Imóveis!", "success");
  } catch (err) {
    loginError.textContent =
      err.message === "Invalid login credentials"
        ? "E-mail ou senha incorretos. Verifique suas credenciais."
        : `Erro ao entrar: ${err.message}`;
    loginError.classList.remove("hidden");
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "Acessar Sistema";
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
  showToast("Sessão encerrada com segurança.", "info");
}

// ============================================================================
// CARREGAMENTO DE DADOS E INDICADORES
// ============================================================================

async function carregarDadosIniciais() {
  await Promise.all([carregarClientes(), carregarImoveis()]);
  atualizarContadoresResumo();
}

function atualizarContadoresResumo() {
  const totalClientesEl = document.getElementById("kpi-total-clientes");
  const visitasAgendadasEl = document.getElementById("kpi-visitas");
  const imoveisAtivosEl = document.getElementById("kpi-imoveis-ativos");

  if (totalClientesEl) {
    totalClientesEl.textContent = state.clientes.length;
  }
  if (visitasAgendadasEl) {
    visitasAgendadasEl.textContent = state.clientes.filter(
      (c) => c.status_funil === "Visita Agendada"
    ).length;
  }
  if (imoveisAtivosEl) {
    imoveisAtivosEl.textContent = state.imoveis.filter(
      (i) => i.status_marketing !== "4. Vendido"
    ).length;
  }
}

// ============================================================================
// 2. MÓDULO DE CLIENTES (FUNIL DE VENDAS)
// ============================================================================

async function carregarClientes() {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showToast(`Erro ao carregar clientes: ${error.message}`, "error");
    return;
  }

  state.clientes = data || [];
  renderizarClientes();
  atualizarContadoresResumo();
}

async function handleNovoClienteSubmit(event) {
  event.preventDefault();

  const nomeEl = document.getElementById("cliente-nome");
  const telefoneEl = document.getElementById("cliente-telefone");
  const statusEl = document.getElementById("cliente-status");
  const perfilEl = document.getElementById("cliente-perfil");
  const btnSubmit = document.getElementById("btn-salvar-cliente");

  const novoCliente = {
    nome: nomeEl.value.trim(),
    telefone: telefoneEl.value.trim(),
    status_funil: statusEl.value,
    perfil_interesse: perfilEl.value.trim()
  };

  if (!novoCliente.nome || !novoCliente.telefone) {
    showToast("Preencha o nome e o telefone do cliente.", "error");
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Salvando...";

  try {
    const { data, error } = await supabase
      .from("clientes")
      .insert([novoCliente])
      .select()
      .single();

    if (error) throw error;

    state.clientes.unshift(data);
    renderizarClientes();
    atualizarContadoresResumo();
    event.target.reset();
    showToast("Cliente adicionado ao funil com sucesso!", "success");
  } catch (err) {
    showToast(`Erro ao salvar cliente: ${err.message}`, "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "+ Cadastrar Lead";
  }
}

async function atualizarStatusCliente(id, novoStatus) {
  const { error } = await supabase
    .from("clientes")
    .update({ status_funil: novoStatus })
    .eq("id", id);

  if (error) {
    showToast(`Erro ao atualizar status: ${error.message}`, "error");
    return;
  }

  const index = state.clientes.findIndex((c) => c.id === id);
  if (index !== -1) {
    state.clientes[index].status_funil = novoStatus;
  }
  renderizarClientes();
  atualizarContadoresResumo();
  showToast(`Status atualizado para "${novoStatus}".`, "success");
}

async function excluirCliente(id, nome) {
  if (!window.confirm(`Deseja realmente remover o lead "${nome}"?`)) return;

  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) {
    showToast(`Erro ao excluir cliente: ${error.message}`, "error");
    return;
  }

  state.clientes = state.clientes.filter((c) => c.id !== id);
  renderizarClientes();
  atualizarContadoresResumo();
  showToast("Lead removido.", "info");
}

function criarCardClienteHTML(cliente) {
  const numeroWhats = limparTelefoneWhatsApp(cliente.telefone);
  const linkWhats = numeroWhats
    ? `https://wa.me/${numeroWhats}?text=${encodeURIComponent(
        `Olá ${cliente.nome}, tudo bem? Aqui é da Andressa Spagnol Imóveis.`
      )}`
    : "#";

  const opcoesStatus = STATUS_FUNIL.map(
    (st) =>
      `<option value="${escapeHtml(st)}" ${
        cliente.status_funil === st ? "selected" : ""
      }>${escapeHtml(st)}</option>`
  ).join("");

  let badgeClass = "badge-prospeccao";
  if (cliente.status_funil === "Visita Agendada") badgeClass = "badge-visita";
  if (cliente.status_funil === "Proposta em Andamento") badgeClass = "badge-proposta";

  return `
    <article class="crm-card cliente-card" data-id="${escapeHtml(cliente.id)}">
      <div class="card-top">
        <div>
          <h4 class="card-title">${escapeHtml(cliente.nome)}</h4>
          <span class="card-date">Cadastrado em ${formatarDataCurta(cliente.created_at)}</span>
        </div>
        <span class="status-badge ${badgeClass}">${escapeHtml(cliente.status_funil)}</span>
      </div>

      ${
        cliente.perfil_interesse
          ? `<p class="card-description"><strong>Perfil de Interesse:</strong> ${escapeHtml(
              cliente.perfil_interesse
            )}</p>`
          : `<p class="card-description text-muted">Sem observações de perfil cadastradas.</p>`
      }

      <div class="card-meta-row">
        <a href="${linkWhats}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp" title="Conversar no WhatsApp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          ${escapeHtml(cliente.telefone)}
        </a>
      </div>

      <div class="card-actions-footer">
        <label class="select-inline-label">
          <span>Etapa:</span>
          <select class="select-status-cliente" data-id="${escapeHtml(cliente.id)}">
            ${opcoesStatus}
          </select>
        </label>
        <button type="button" class="btn-icon-delete btn-delete-cliente" data-id="${escapeHtml(
          cliente.id
        )}" data-nome="${escapeHtml(cliente.nome)}" title="Excluir Lead">
          Excluir
        </button>
      </div>
    </article>
  `;
}

function renderizarClientes() {
  const containerKanban = document.getElementById("clientes-kanban-container");
  const containerLista = document.getElementById("clientes-lista-container");

  if (!containerKanban || !containerLista) return;

  if (state.clientesView === "kanban") {
    containerKanban.classList.remove("hidden");
    containerLista.classList.add("hidden");

    containerKanban.innerHTML = STATUS_FUNIL.map((etapa) => {
      const clientesEtapa = state.clientes.filter((c) => c.status_funil === etapa);
      return `
        <div class="kanban-column">
          <div class="kanban-column-header">
            <h3>${escapeHtml(etapa)}</h3>
            <span class="kanban-count">${clientesEtapa.length}</span>
          </div>
          <div class="kanban-column-body">
            ${
              clientesEtapa.length > 0
                ? clientesEtapa.map(criarCardClienteHTML).join("")
                : `<div class="empty-column">Nenhum cliente nesta etapa.</div>`
            }
          </div>
        </div>
      `;
    }).join("");
  } else {
    containerKanban.classList.add("hidden");
    containerLista.classList.remove("hidden");

    if (state.clientes.length === 0) {
      containerLista.innerHTML = `
        <div class="empty-state-box">
          <p>Nenhum lead cadastrado ainda. Utilize o formulário acima para registrar seu primeiro cliente.</p>
        </div>
      `;
    } else {
      containerLista.innerHTML = `
        <div class="cards-grid">
          ${state.clientes.map(criarCardClienteHTML).join("")}
        </div>
      `;
    }
  }
}

// ============================================================================
// 3. MÓDULO DE IMÓVEIS (CAPTAÇÕES E INTEGRAÇÃO GOOGLE DRIVE)
// ============================================================================

async function carregarImoveis() {
  const { data, error } = await supabase
    .from("imoveis")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showToast(`Erro ao carregar imóveis: ${error.message}`, "error");
    return;
  }

  state.imoveis = data || [];
  renderizarImoveis();
  atualizarContadoresResumo();
}

async function handleNovoImovelSubmit(event) {
  event.preventDefault();

  const tituloEl = document.getElementById("imovel-titulo");
  const valorEl = document.getElementById("imovel-valor");
  const statusEl = document.getElementById("imovel-status");
  const btnSubmit = document.getElementById("btn-salvar-imovel");
  const statusFeedbackEl = document.getElementById("imovel-submit-status");

  const titulo = tituloEl.value.trim();
  const valorNumerico = parseFloat(valorEl.value.replace(/\./g, "").replace(",", ".")) || Number(valorEl.value) || 0;
  const statusMarketing = statusEl.value;

  if (!titulo) {
    showToast("Informe o título do imóvel.", "error");
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Criando pasta no Google Drive...";
  statusFeedbackEl.textContent =
    "1/2 Conectando ao Google Drive para criar pasta de Fotos e Documentos...";
  statusFeedbackEl.classList.remove("hidden");

  try {
    // REGRA DE NEGÓCIO CRUCIAL:
    // 1. Dispara POST para o Webhook do Google Apps Script com o nome do imóvel
    const urlPastaDrive = await criarPastaDriveImovel(titulo);

    // 2. Intercepta a URL devolvida pelo Apps Script e salva no Supabase na coluna `link_drive_fotos`
    btnSubmit.textContent = "Salvando no Supabase...";
    statusFeedbackEl.textContent =
      "2/2 Pasta criada! Salvando registro do imóvel no banco de dados...";

    const novoImovel = {
      titulo,
      valor: valorNumerico,
      status_marketing: statusMarketing,
      link_drive_fotos: urlPastaDrive
    };

    const { data, error } = await supabase
      .from("imoveis")
      .insert([novoImovel])
      .select()
      .single();

    if (error) throw error;

    state.imoveis.unshift(data);
    renderizarImoveis();
    atualizarContadoresResumo();
    event.target.reset();
    showToast("Imóvel cadastrado e pasta criada no Google Drive!", "success");
  } catch (err) {
    showToast(`Falha no cadastro: ${err.message}`, "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "+ Cadastrar Imóvel e Gerar Pasta no Drive";
    statusFeedbackEl.classList.add("hidden");
  }
}

async function atualizarStatusImovel(id, novoStatus) {
  const { error } = await supabase
    .from("imoveis")
    .update({ status_marketing: novoStatus })
    .eq("id", id);

  if (error) {
    showToast(`Erro ao atualizar status do imóvel: ${error.message}`, "error");
    return;
  }

  const index = state.imoveis.findIndex((i) => i.id === id);
  if (index !== -1) {
    state.imoveis[index].status_marketing = novoStatus;
  }
  renderizarImoveis();
  atualizarContadoresResumo();
  showToast(`Status do imóvel alterado para "${novoStatus}".`, "success");
}

async function excluirImovel(id, titulo) {
  if (!window.confirm(`Deseja realmente excluir o imóvel "${titulo}" do CRM?`)) return;

  const { error } = await supabase.from("imoveis").delete().eq("id", id);
  if (error) {
    showToast(`Erro ao excluir imóvel: ${error.message}`, "error");
    return;
  }

  state.imoveis = state.imoveis.filter((i) => i.id !== id);
  renderizarImoveis();
  atualizarContadoresResumo();
  showToast("Imóvel removido do CRM.", "info");
}

function renderizarImoveis() {
  const container = document.getElementById("imoveis-grid-container");
  if (!container) return;

  const listaFiltrada =
    state.filtroImoveis === "ativos"
      ? state.imoveis.filter((im) => im.status_marketing !== "4. Vendido")
      : state.imoveis;

  if (listaFiltrada.length === 0) {
    container.innerHTML = `
      <div class="empty-state-box">
        <p>Nenhum imóvel encontrado para o filtro selecionado.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = listaFiltrada
    .map((imovel) => {
      const opcoesStatus = STATUS_MARKETING.map(
        (st) =>
          `<option value="${escapeHtml(st)}" ${
            imovel.status_marketing === st ? "selected" : ""
          }>${escapeHtml(st)}</option>`
      ).join("");

      let mktBadgeClass = "badge-mkt-1";
      if (imovel.status_marketing.startsWith("2.")) mktBadgeClass = "badge-mkt-2";
      if (imovel.status_marketing.startsWith("3.")) mktBadgeClass = "badge-mkt-3";
      if (imovel.status_marketing.startsWith("4.")) mktBadgeClass = "badge-mkt-4";

      const temLinkDrive = Boolean(imovel.link_drive_fotos && imovel.link_drive_fotos.trim());

      return `
        <article class="crm-card imovel-card" data-id="${escapeHtml(imovel.id)}">
          <div class="card-top">
            <div>
              <span class="card-date">Captado em ${formatarDataCurta(imovel.created_at)}</span>
              <h4 class="card-title">${escapeHtml(imovel.titulo)}</h4>
            </div>
            <span class="status-badge ${mktBadgeClass}">${escapeHtml(
        imovel.status_marketing
      )}</span>
          </div>

          <div class="imovel-price">${formatarMoeda(imovel.valor)}</div>

          <div class="drive-action-wrapper">
            ${
              temLinkDrive
                ? `<a href="${escapeHtml(
                    imovel.link_drive_fotos
                  )}" target="_blank" rel="noopener noreferrer" class="btn-drive-folder">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    Abrir Pasta de Documentos/Fotos
                  </a>`
                : `<span class="drive-missing">Pasta do Drive não vinculada</span>`
            }
          </div>

          <div class="card-actions-footer">
            <label class="select-inline-label">
              <span>Status:</span>
              <select class="select-status-imovel" data-id="${escapeHtml(imovel.id)}">
                ${opcoesStatus}
              </select>
            </label>
            <button type="button" class="btn-icon-delete btn-delete-imovel" data-id="${escapeHtml(
              imovel.id
            )}" data-titulo="${escapeHtml(imovel.titulo)}">
              Excluir
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

// ============================================================================
// EVENT LISTENERS E NAVEGAÇÃO SPA
// ============================================================================

function configurarEventosDOM() {
  // Login e Logout
  const formLogin = document.getElementById("form-login");
  formLogin?.addEventListener("submit", handleLoginSubmit);

  const btnLogout = document.getElementById("btn-logout");
  btnLogout?.addEventListener("click", handleLogout);

  // Máscara de telefone no input do cliente
  const inputTelefone = document.getElementById("cliente-telefone");
  inputTelefone?.addEventListener("input", (e) => {
    e.target.value = aplicarMascaraTelefone(e.target.value);
  });

  // Navegação entre Abas principais (Clientes vs Imóveis)
  const tabBtns = document.querySelectorAll(".nav-tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;
      state.activeTab = targetTab;

      tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === targetTab));
      document
        .getElementById("section-clientes")
        ?.classList.toggle("hidden", targetTab !== "clientes");
      document
        .getElementById("section-imoveis")
        ?.classList.toggle("hidden", targetTab !== "imoveis");
    });
  });

  // Alternância Kanban / Lista no módulo de Clientes
  const viewBtns = document.querySelectorAll(".view-toggle-btn");
  viewBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.clientesView = btn.dataset.view;
      viewBtns.forEach((b) =>
        b.classList.toggle("active", b.dataset.view === state.clientesView)
      );
      renderizarClientes();
    });
  });

  // Filtro de Imóveis (Ativos vs Todos)
  const filterBtns = document.querySelectorAll(".filter-imoveis-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filtroImoveis = btn.dataset.filter;
      filterBtns.forEach((b) =>
        b.classList.toggle("active", b.dataset.filter === state.filtroImoveis)
      );
      renderizarImoveis();
    });
  });

  // Formulários de Cadastro
  document
    .getElementById("form-novo-cliente")
    ?.addEventListener("submit", handleNovoClienteSubmit);

  document
    .getElementById("form-novo-imovel")
    ?.addEventListener("submit", handleNovoImovelSubmit);

  // Delegação de eventos para Cards de Clientes (Mudança de Status e Exclusão)
  const sectionClientes = document.getElementById("section-clientes");
  sectionClientes?.addEventListener("change", (e) => {
    if (e.target.matches(".select-status-cliente")) {
      atualizarStatusCliente(e.target.dataset.id, e.target.value);
    }
  });
  sectionClientes?.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".btn-delete-cliente");
    if (deleteBtn) {
      excluirCliente(deleteBtn.dataset.id, deleteBtn.dataset.nome);
    }
  });

  // Delegação de eventos para Cards de Imóveis (Mudança de Status e Exclusão)
  const sectionImoveis = document.getElementById("section-imoveis");
  sectionImoveis?.addEventListener("change", (e) => {
    if (e.target.matches(".select-status-imovel")) {
      atualizarStatusImovel(e.target.dataset.id, e.target.value);
    }
  });
  sectionImoveis?.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".btn-delete-imovel");
    if (deleteBtn) {
      excluirImovel(deleteBtn.dataset.id, deleteBtn.dataset.titulo);
    }
  });
}

// Inicialização quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  configurarEventosDOM();
  inicializarAutenticacao();
});

