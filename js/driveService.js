/**
 * ============================================================================
 * INTEGRAÇÃO COM GOOGLE DRIVE (GOOGLE APPS SCRIPT WEBHOOK)
 * ============================================================================
 */

import { CONFIG } from "./config.js";
import { isWebhookConfigured } from "./supabaseClient.js";

/**
 * Dispara um POST para o Google Apps Script criar a pasta do imóvel no Google Drive
 * e retorna a URL da pasta criada.
 *
 * Nota técnica sobre CORS no Google Apps Script:
 * Usamos `Content-Type: text/plain;charset=utf-8` com o corpo serializado em JSON
 * para evitar a requisição preflight `OPTIONS` (que o Apps Script não suporta nativamente),
 * permitindo ler o JSON retornado com segurança diretamente no navegador.
 *
 * @param {string} tituloImovel - Nome/título do imóvel captado
 * @returns {Promise<string>} URL da pasta criada no Google Drive
 */
export async function criarPastaDriveImovel(tituloImovel) {
  if (!isWebhookConfigured()) {
    throw new Error(
      "WEBHOOK_URL não configurada em js/config.js. Configure a URL do seu Google Apps Script."
    );
  }

  const response = await fetch(CONFIG.WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      titulo: tituloImovel.trim(),
      origem: "CRM Andressa Spagnol Imóveis",
      timestamp: new Date().toISOString()
    }),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Falha HTTP ao comunicar com Google Drive (${response.status}).`);
  }

  const data = await response.json();

  if (!data || !data.success || !data.url) {
    throw new Error(data?.error || "O Google Apps Script não retornou a URL da pasta.");
  }

  return data.url;
}

