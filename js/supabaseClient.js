/**
 * ============================================================================
 * INICIALIZAÇÃO DO CLIENTE SUPABASE (SDK v2)
 * ============================================================================
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CONFIG } from "./config.js";

/**
 * Verifica se as credenciais do Supabase foram preenchidas em `js/config.js`
 */
export function isSupabaseConfigured() {
  return (
    Boolean(CONFIG.SUPABASE_URL) &&
    Boolean(CONFIG.SUPABASE_KEY) &&
    !CONFIG.SUPABASE_URL.includes("SEU-PROJETO") &&
    !CONFIG.SUPABASE_KEY.includes("SUA_SUPABASE_ANON_PUBLIC_KEY")
  );
}

/**
 * Verifica se o Webhook do Google Apps Script foi configurado em `js/config.js`
 */
export function isWebhookConfigured() {
  return (
    Boolean(CONFIG.WEBHOOK_URL) &&
    !CONFIG.WEBHOOK_URL.includes("SEU_DEPLOYMENT_ID")
  );
}

// Instância única do cliente Supabase v2
export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

