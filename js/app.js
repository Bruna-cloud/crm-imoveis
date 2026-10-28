/**
 * ============================================================================
 * LÓGICA PRINCIPAL DO CRM - ANDRESSA SPAGNOL IMÓVEIS (V2)
 * Inclui:
 * - Autenticação Supabase Auth
 * - Módulo de Clientes Refatorado (primeiro_nome, sobrenome, email) + Exportação CSV Meta Ads
 * - Módulo de Captação de Imóveis + Pasta Automática no Google Drive
 * - Módulo de Gestão de Conteúdo (Linha Editorial) + Geração de Roteiro com IA (Gemini)
 * - Módulo de Integração Bidirecional com Google Calendar (Iframe + Webhook de Agendamento)
 * ============================================================================
 */

import {
  CONFIG,
  GEMINI_API_KEY,
  STATUS_FUNIL,
  STATUS_MARKETING,
  STATUS_CONTEUDO
} from "./config.js";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { criarPastaDriveImovel } from "./driveService.js";

const state = {
  user: null,
  activeTab: "clientes", // 'clientes' | 'imoveis' | 'conteudos' | 'agenda'
  clientesView: "kanban", // 'kanban' | 'lista'
  conteudosView: "kanban", // 'kanban' | 'lista'
  filtroImoveis: "ativos", // 'ativos' | 'todos'
  clientes: [],
  imoveis: [],
  conteudos: []
};

// ============================================================================
// UTILITÁRIOS DE FORMATAÇÃO E REGEX
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
  if (isNaN(data.getTime())) return isoString;
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function obterPrimeiroNome(cliente) {
  if (cliente.primeiro_nome) return cliente.primeiro_nome.trim();
  if (cliente.nome) return cliente.nome.trim().split(/\s+/)[0] || "";
  return "";
}

function obterSobrenome(cliente) {
  if (cliente.sobrenome) return cliente.sobrenome.trim();
  if (cliente.nome) {
    const partes = cliente.nome.trim().split(/\s+/);
    return partes.length > 1 ? partes.slice(1).join(" ") : "";
  }
  return "";
}

function obterNomeCompleto(cliente) {
  const fn = obterPrimeiroNome(cliente);
  const ln = obterSobrenome(cliente);
  return `${fn} ${ln}`.trim() || "Cliente sem nome";
}

/**
 * Regra de Limpeza (Regex) para Meta Ads e WhatsApp:
 * Remove qualquer caractere não numérico e garante o prefixo DDI 55 (Brasil).
 */
export function limparTelefoneBrasilDDI(telefone) {
  const apenasDigitos = String(telefone || "").replace(/\D/g, "");
  if (!apenasDigitos) return "";
  // Se já começa com 55 e possui 12 ou 13 dígitos (55 + DDD + 8 ou 9 dígitos), mantém
  if (apenasDigitos.startsWith("55") && apenasDigitos.length >= 12) {
    return apenasDigitos;
  }
  return `55${apenasDigitos}`;
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

function escaparValorCSV(valor) {
  const limpo = String(valor ?? "").replace(/\r?\n|\r/g, " ").trim();
  if (limpo.includes(",") || limpo.includes('"')) {
    return `"${limpo.replace(/"/g, '""')}"`;
  }
  return limpo;
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
// AUTENTICAÇÃO (SUPABASE AUTH)
// ============================================================================

async function inicializarAutenticacao() {
  const configAlert = document.getElementById("config-warning");
  if (!isSupabaseConfigured()) {
    configAlert?.classList.remove("hidden");
  }

  const { data, error } = await supabase.auth.getSession();
  if (!error && data?.session?.user) {
    atualizarEstadoAutenticado(data.session.user);
  } else {
    atualizarEstadoAutenticado(null);
  }

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
    authScreen.classList.add("hidden");
    crmScreen.classList.remove("hidden");
    if (userEmailBadge) userEmailBadge.textContent = user.email;
    carregarDadosIniciais();
  } else {
    state.clientes = [];
    state.imoveis = [];
    state.conteudos = [];
    crmScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const btnLogin = document.getElementById("btn-login");
  const loginError = document.getElementById("login-error");

  loginError.classList.add("hidden");
  btnLogin.disabled = true;
  btnLogin.textContent = "Autenticando...";

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    if (error) throw error;
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

async function carregarDadosIniciais() {
  await Promise.all([carregarClientes(), carregarImoveis(), carregarConteudos()]);
  atualizarContadoresResumo();
}

function atualizarContadoresResumo() {
  const totalClientesEl = document.getElementById("kpi-total-clientes");
  const visitasAgendadasEl = document.getElementById("kpi-visitas");
  const imoveisAtivosEl = document.getElementById("kpi-imoveis-ativos");

  if (totalClientesEl) totalClientesEl.textContent = state.clientes.length;
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
// MÓDULO 1: CLIENTES (REFATORADO) + EXPORTAÇÃO CSV PARA META ADS
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

  const primeiroNomeEl = document.getElementById("cliente-primeiro-nome");
  const sobrenomeEl = document.getElementById("cliente-sobrenome");
  const emailEl = document.getElementById("cliente-email");
  const telefoneEl = document.getElementById("cliente-telefone");
  const statusEl = document.getElementById("cliente-status");
  const perfilEl = document.getElementById("cliente-perfil");
  const btnSubmit = document.getElementById("btn-salvar-cliente");

  const novoCliente = {
    primeiro_nome: primeiroNomeEl.value.trim(),
    sobrenome: sobrenomeEl.value.trim(),
    email: emailEl.value.trim().toLowerCase(),
    telefone: telefoneEl.value.trim(),
    status_funil: statusEl.value,
    perfil_interesse: perfilEl.value.trim()
  };

  if (!novoCliente.primeiro_nome || !novoCliente.telefone) {
    showToast("Preencha pelo menos o Primeiro Nome e o Telefone.", "error");
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
    showToast("Lead cadastrado com sucesso!", "success");
  } catch (err) {
    showToast(`Erro ao salvar cliente: ${err.message}`, "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "+ Cadastrar Lead";
  }
}

/**
 * Exporta todos os leads cadastrados em formato .CSV estritamente compatível
 * com Públicos Personalizados do Meta Ads / Facebook Ads (`fn,ln,phone,email`).
 */
export function exportarLeadsMetaAdsCSV() {
  if (!state.clientes || state.clientes.length === 0) {
    showToast("Não há clientes cadastrados para exportar.", "error");
    return;
  }

  const cabecalho = "fn,ln,phone,email";
  const linhas = state.clientes.map((cliente) => {
    const fn = escaparValorCSV(obterPrimeiroNome(cliente));
    const ln = escaparValorCSV(obterSobrenome(cliente));
    // Limpa caracteres especiais via Regex (\D) e prefixa com 55 (DDI Brasil)
    const phone = escaparValorCSV(limparTelefoneBrasilDDI(cliente.telefone));
    const email = escaparValorCSV((cliente.email || "").trim().toLowerCase());
    return `${fn},${ln},${phone},${email}`;
  });

  const conteudoCSV = [cabecalho, ...linhas].join("\r\n");
  const blob = new Blob([conteudoCSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  const hoje = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `leads_meta_ads_${hoje}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(
    `Arquivo CSV exportado com ${state.clientes.length} lead(s) para Meta Ads!`,
    "success"
  );
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
  if (index !== -1) state.clientes[index].status_funil = novoStatus;
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
  const nomeCompleto = obterNomeCompleto(cliente);
  const numeroWhats = limparTelefoneBrasilDDI(cliente.telefone);
  const linkWhats = numeroWhats
    ? `https://wa.me/${numeroWhats}?text=${encodeURIComponent(
        `Olá ${obterPrimeiroNome(cliente)}, tudo bem? Aqui é da Andressa Spagnol Imóveis.`
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
          <h4 class="card-title">${escapeHtml(nomeCompleto)}</h4>
          <span class="card-date">Cadastrado em ${formatarDataCurta(cliente.created_at)}</span>
        </div>
        <span class="status-badge ${badgeClass}">${escapeHtml(cliente.status_funil)}</span>
      </div>

      ${
        cliente.email
          ? `<div class="card-email">✉️ ${escapeHtml(cliente.email)}</div>`
          : ""
      }

      ${
        cliente.perfil_interesse
          ? `<p class="card-description"><strong>Perfil de Interesse:</strong> ${escapeHtml(
              cliente.perfil_interesse
            )}</p>`
          : `<p class="card-description text-muted">Sem observações de perfil cadastradas.</p>`
      }

      <div class="card-meta-row">
        <a href="${linkWhats}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp">
          WhatsApp: ${escapeHtml(cliente.telefone)}
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
        )}" data-nome="${escapeHtml(nomeCompleto)}">
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

    containerLista.innerHTML =
      state.clientes.length === 0
        ? `<div class="empty-state-box"><p>Nenhum lead cadastrado ainda.</p></div>`
        : `<div class="cards-grid">${state.clientes.map(criarCardClienteHTML).join("")}</div>`;
  }
}

// ============================================================================
// MÓDULO DE IMÓVEIS (CAPTAÇÕES + GOOGLE DRIVE)
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
  const valorNumerico = Number(valorEl.value) || 0;
  const statusMarketing = statusEl.value;

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Criando pasta no Google Drive...";
  statusFeedbackEl.textContent =
    "1/2 Conectando ao Google Drive para criar pasta de Fotos e Documentos...";
  statusFeedbackEl.classList.remove("hidden");

  try {
    const urlPastaDrive = await criarPastaDriveImovel(titulo);
    btnSubmit.textContent = "Salvando no Supabase...";
    statusFeedbackEl.textContent =
      "2/2 Pasta criada! Salvando registro do imóvel no banco de dados...";

    const { data, error } = await supabase
      .from("imoveis")
      .insert([
        {
          titulo,
          valor: valorNumerico,
          status_marketing: statusMarketing,
          link_drive_fotos: urlPastaDrive
        }
      ])
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
  if (index !== -1) state.imoveis[index].status_marketing = novoStatus;
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
    container.innerHTML = `<div class="empty-state-box"><p>Nenhum imóvel encontrado para o filtro selecionado.</p></div>`;
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
                    📁 Abrir Pasta de Documentos/Fotos
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
// MÓDULO 2: GESTÃO DE CONTEÚDO E IA (LINHA EDITORIAL + GEMINI API)
// ============================================================================

async function carregarConteudos() {
  const { data, error } = await supabase
    .from("conteudos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    // Se a tabela ainda não foi migrada no Supabase, não trava os demais módulos
    console.warn("Aviso ao carregar tabela conteudos:", error.message);
    return;
  }

  state.conteudos = data || [];
  renderizarConteudos();
}

/**
 * Chama o endpoint público do Gemini (Google AI Studio) enviando o tema informado
 * com um prompt especialista em marketing imobiliário e preenche o campo `roteiro`.
 */
export async function gerarRoteiroComIA() {
  const temaEl = document.getElementById("conteudo-tema");
  const formatoEl = document.getElementById("conteudo-formato");
  const roteiroEl = document.getElementById("conteudo-roteiro");
  const btnIA = document.getElementById("btn-gerar-ia");

  const tema = temaEl?.value.trim() || "";
  const formato = formatoEl?.value || "Reels";

  if (!tema) {
    showToast("Digite um Tema primeiro antes de gerar a ideia com IA.", "error");
    temaEl?.focus();
    return;
  }

  const apiKey = (GEMINI_API_KEY || CONFIG.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    showToast(
      "Preencha a constante GEMINI_API_KEY no código para usar a geração com IA.",
      "error"
    );
    return;
  }

  btnIA.disabled = true;
  const textoOriginal = btnIA.textContent;
  btnIA.textContent = "✨ Gerando roteiro...";

  const promptMarketingImobiliario = `Você é um estrategista sênior de Marketing Imobiliário de alto padrão atuando para a corretora "Andressa Spagnol Imóveis" (CRECI 7734F, Vitória/ES e região).
Crie um roteiro prático, magnético e persuasivo no formato "${formato}" sobre o seguinte tema: "${tema}".

Estruture a resposta de forma limpa e direta para gravação:
1. GANCHO (Primeiros 3 segundos): Frase de impacto para reter a atenção imediata.
2. DESENVOLVIMENTO (Conteúdo de Valor): 3 pontos objetivos, elegantes e com autoridade no mercado imobiliário.
3. CHAMADA PARA AÇÃO (CTA): Convite claro para chamar no Direct ou WhatsApp da Andressa Spagnol Imóveis.
4. SUGESTÃO DE LEGENDA + 5 HASHTAGS estratégicas.`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: promptMarketingImobiliario }]
          }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData?.error?.message || `Erro HTTP ${response.status} na API do Gemini.`
      );
    }

    const result = await response.json();
    const textoGerado =
      result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!textoGerado) {
      throw new Error("A IA não retornou texto para o roteiro.");
    }

    roteiroEl.value = textoGerado;
    showToast("Roteiro gerado com sucesso pela IA!", "success");
  } catch (err) {
    showToast(`Falha ao gerar com IA: ${err.message}`, "error");
  } finally {
    btnIA.disabled = false;
    btnIA.textContent = textoOriginal;
  }
}

async function handleNovoConteudoSubmit(event) {
  event.preventDefault();

  const temaEl = document.getElementById("conteudo-tema");
  const formatoEl = document.getElementById("conteudo-formato");
  const dataGravacaoEl = document.getElementById("conteudo-data");
  const statusEl = document.getElementById("conteudo-status");
  const roteiroEl = document.getElementById("conteudo-roteiro");
  const btnSubmit = document.getElementById("btn-salvar-conteudo");

  const novoConteudo = {
    tema: temaEl.value.trim(),
    formato: formatoEl.value || "Reels",
    data_gravacao: dataGravacaoEl.value || null,
    status: statusEl.value || "Ideia",
    roteiro: roteiroEl.value.trim()
  };

  if (!novoConteudo.tema) {
    showToast("Informe o tema do conteúdo.", "error");
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Salvando...";

  try {
    const { data, error } = await supabase
      .from("conteudos")
      .insert([novoConteudo])
      .select()
      .single();

    if (error) throw error;

    state.conteudos.unshift(data);
    renderizarConteudos();
    event.target.reset();
    showToast("Conteúdo salvo na Linha Editorial!", "success");
  } catch (err) {
    showToast(`Erro ao salvar conteúdo: ${err.message}`, "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "+ Salvar Conteúdo na Linha Editorial";
  }
}

async function atualizarStatusConteudo(id, novoStatus) {
  const { error } = await supabase
    .from("conteudos")
    .update({ status: novoStatus })
    .eq("id", id);

  if (error) {
    showToast(`Erro ao atualizar status do conteúdo: ${error.message}`, "error");
    return;
  }

  const idx = state.conteudos.findIndex((c) => c.id === id);
  if (idx !== -1) state.conteudos[idx].status = novoStatus;
  renderizarConteudos();
  showToast(`Status do conteúdo movido para "${novoStatus}".`, "success");
}

async function excluirConteudo(id, tema) {
  if (!window.confirm(`Deseja excluir a pauta "${tema}"?`)) return;

  const { error } = await supabase.from("conteudos").delete().eq("id", id);
  if (error) {
    showToast(`Erro ao excluir conteúdo: ${error.message}`, "error");
    return;
  }

  state.conteudos = state.conteudos.filter((c) => c.id !== id);
  renderizarConteudos();
  showToast("Conteúdo removido.", "info");
}

function criarCardConteudoHTML(item) {
  const opcoesStatus = STATUS_CONTEUDO.map(
    (st) =>
      `<option value="${escapeHtml(st)}" ${
        item.status === st ? "selected" : ""
      }>${escapeHtml(st)}</option>`
  ).join("");

  return `
    <article class="crm-card conteudo-card" data-id="${escapeHtml(item.id)}">
      <div class="card-top">
        <div>
          <span class="formato-pill">${escapeHtml(item.formato || "Reels")}</span>
          <h4 class="card-title" style="margin-top: 0.35rem;">${escapeHtml(item.tema)}</h4>
        </div>
        <span class="status-badge badge-prospeccao">${escapeHtml(item.status)}</span>
      </div>

      ${
        item.data_gravacao
          ? `<div class="card-date">📅 Gravação: <strong>${formatarDataCurta(
              item.data_gravacao
            )}</strong></div>`
          : ""
      }

      ${
        item.roteiro
          ? `<pre class="roteiro-preview">${escapeHtml(item.roteiro)}</pre>`
          : `<p class="card-description text-muted">Sem roteiro cadastrado.</p>`
      }

      <div class="card-actions-footer">
        <label class="select-inline-label">
          <span>Status:</span>
          <select class="select-status-conteudo" data-id="${escapeHtml(item.id)}">
            ${opcoesStatus}
          </select>
        </label>
        <button type="button" class="btn-icon-delete btn-delete-conteudo" data-id="${escapeHtml(
          item.id
        )}" data-tema="${escapeHtml(item.tema)}">
          Excluir
        </button>
      </div>
    </article>
  `;
}

function renderizarConteudos() {
  const containerKanban = document.getElementById("conteudos-kanban-container");
  const containerLista = document.getElementById("conteudos-lista-container");
  if (!containerKanban || !containerLista) return;

  if (state.conteudosView === "kanban") {
    containerKanban.classList.remove("hidden");
    containerLista.classList.add("hidden");

    containerKanban.innerHTML = STATUS_CONTEUDO.map((etapa) => {
      const itens = state.conteudos.filter((c) => c.status === etapa);
      return `
        <div class="kanban-column">
          <div class="kanban-column-header">
            <h3>${escapeHtml(etapa)}</h3>
            <span class="kanban-count">${itens.length}</span>
          </div>
          <div class="kanban-column-body">
            ${
              itens.length > 0
                ? itens.map(criarCardConteudoHTML).join("")
                : `<div class="empty-column">Sem pautas</div>`
            }
          </div>
        </div>
      `;
    }).join("");
  } else {
    containerKanban.classList.add("hidden");
    containerLista.classList.remove("hidden");
    containerLista.innerHTML =
      state.conteudos.length === 0
        ? `<div class="empty-state-box"><p>Nenhum conteúdo cadastrado na Linha Editorial.</p></div>`
        : `<div class="cards-grid">${state.conteudos.map(criarCardConteudoHTML).join("")}</div>`;
  }
}

// ============================================================================
// MÓDULO 3: INTEGRAÇÃO BIDIRECIONAL COM GOOGLE CALENDAR
// ============================================================================

async function handleAgendarVisitaSubmit(event) {
  event.preventDefault();

  const tituloEl = document.getElementById("agenda-titulo");
  const dataHoraEl = document.getElementById("agenda-data-hora");
  const descricaoEl = document.getElementById("agenda-descricao");
  const btnSubmit = document.getElementById("btn-agendar-visita");

  const titulo = tituloEl.value.trim();
  const dataHora = dataHoraEl.value;
  const descricao = descricaoEl?.value.trim() || "";

  if (!titulo || !dataHora) {
    showToast("Preencha o título e a data/hora do compromisso.", "error");
    return;
  }

  const webhookUrl = (CONFIG.CALENDAR_WEBHOOK_URL || CONFIG.WEBHOOK_URL || "").trim();
  if (!webhookUrl) {
    showToast("Configure o CALENDAR_WEBHOOK_URL para agendar no Google Calendar.", "error");
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Enviando para o Google Calendar...";

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "calendar",
        titulo,
        data_hora: new Date(dataHora).toISOString(),
        descricao
      }),
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`Falha HTTP (${response.status}) ao comunicar com o Webhook.`);
    }

    const resData = await response.json();
    if (!resData || !resData.success) {
      throw new Error(
        resData?.error || "O Apps Script retornou erro ao criar o evento na agenda."
      );
    }

    event.target.reset();
    showToast("Compromisso de 1h agendado com sucesso no Google Calendar!", "success");

    // Recarrega o iframe da agenda para refletir o novo evento
    const iframe = document.getElementById("google-calendar-iframe");
    if (iframe && iframe.src && !iframe.src.includes("SEU_EMAIL_PUBLICO")) {
      iframe.src = iframe.src;
    }
  } catch (err) {
    showToast(`Erro ao agendar: ${err.message}`, "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "📅 Agendar Visita / Compromisso (1h)";
  }
}

// ============================================================================
// CONFIGURAÇÃO DE EVENTOS DO DOM
// ============================================================================

function configurarEventosDOM() {
  document.getElementById("form-login")?.addEventListener("submit", handleLoginSubmit);
  document.getElementById("btn-logout")?.addEventListener("click", handleLogout);

  document.getElementById("cliente-telefone")?.addEventListener("input", (e) => {
    e.target.value = aplicarMascaraTelefone(e.target.value);
  });

  // Botão Exportar CSV Meta Ads
  document
    .getElementById("btn-exportar-meta-csv")
    ?.addEventListener("click", exportarLeadsMetaAdsCSV);

  // Botão Gerar Ideia com IA (Gemini)
  document.getElementById("btn-gerar-ia")?.addEventListener("click", gerarRoteiroComIA);

  // Navegação entre as 4 Abas principais
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
      document
        .getElementById("section-conteudos")
        ?.classList.toggle("hidden", targetTab !== "conteudos");
      document
        .getElementById("section-agenda")
        ?.classList.toggle("hidden", targetTab !== "agenda");
    });
  });

  // Alternância Kanban / Lista (Clientes)
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

  // Alternância Kanban / Lista (Conteúdos)
  const conteudosViewBtns = document.querySelectorAll(".conteudos-view-btn");
  conteudosViewBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.conteudosView = btn.dataset.view;
      conteudosViewBtns.forEach((b) =>
        b.classList.toggle("active", b.dataset.view === state.conteudosView)
      );
      renderizarConteudos();
    });
  });

  // Filtro de Imóveis
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

  // Submissão de Formulários
  document
    .getElementById("form-novo-cliente")
    ?.addEventListener("submit", handleNovoClienteSubmit);
  document
    .getElementById("form-novo-imovel")
    ?.addEventListener("submit", handleNovoImovelSubmit);
  document
    .getElementById("form-novo-conteudo")
    ?.addEventListener("submit", handleNovoConteudoSubmit);
  document
    .getElementById("form-agendar-visita")
    ?.addEventListener("submit", handleAgendarVisitaSubmit);

  // Delegação de eventos: Clientes
  const sectionClientes = document.getElementById("section-clientes");
  sectionClientes?.addEventListener("change", (e) => {
    if (e.target.matches(".select-status-cliente")) {
      atualizarStatusCliente(e.target.dataset.id, e.target.value);
    }
  });
  sectionClientes?.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".btn-delete-cliente");
    if (deleteBtn) excluirCliente(deleteBtn.dataset.id, deleteBtn.dataset.nome);
  });

  // Delegação de eventos: Imóveis
  const sectionImoveis = document.getElementById("section-imoveis");
  sectionImoveis?.addEventListener("change", (e) => {
    if (e.target.matches(".select-status-imovel")) {
      atualizarStatusImovel(e.target.dataset.id, e.target.value);
    }
  });
  sectionImoveis?.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".btn-delete-imovel");
    if (deleteBtn) excluirImovel(deleteBtn.dataset.id, deleteBtn.dataset.titulo);
  });

  // Delegação de eventos: Conteúdos
  const sectionConteudos = document.getElementById("section-conteudos");
  sectionConteudos?.addEventListener("change", (e) => {
    if (e.target.matches(".select-status-conteudo")) {
      atualizarStatusConteudo(e.target.dataset.id, e.target.value);
    }
  });
  sectionConteudos?.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".btn-delete-conteudo");
    if (deleteBtn) excluirConteudo(deleteBtn.dataset.id, deleteBtn.dataset.tema);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  configurarEventosDOM();
  inicializarAutenticacao();
});
