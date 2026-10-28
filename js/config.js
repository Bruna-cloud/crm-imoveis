/**
 * ============================================================================
 * CONFIGURAÇÕES E CREDENCIAIS DO SISTEMA
 * Andressa Spagnol Imóveis - CRM Imobiliário
 * ============================================================================
 * Substitua os valores abaixo pelas credenciais reais do seu projeto Supabase
 * e pela URL do seu Web App publicado no Google Apps Script.
 */

export const CONFIG = {
  // URL do Projeto no Supabase (Project Settings > API > Project URL)
  SUPABASE_URL: "https://zfjnvgovyywjcjhmizxj.supabase.co",

  // Chave Pública Anon do Supabase (Project Settings > API > Project API keys > anon public)
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpmam52Z292eXl3amNqaG1penhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDEwNTEsImV4cCI6MjEwODc3NzA1MX0.n8JNS8EXcW1YFUrlLzJxbifocjrlLZ56iMnEREtEQVE",

  // URL do Webhook do Google Apps Script (Implantar > App da Web > URL /exec)
  WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbwrVLCJbLjWI7PaaJIMu1KEE65pfGy7YfnVp5iGoO1MvB5QB4LXEy-NBkYxZjaY6wkNvA/exec"
};

export const STATUS_FUNIL = [
  "Prospecção",
  "Visita Agendada",
  "Proposta em Andamento"
];

export const STATUS_MARKETING = [
  "1. Fazer Fotos",
  "2. Pronto para Postar",
  "3. Anunciado",
  "4. Vendido"
];

