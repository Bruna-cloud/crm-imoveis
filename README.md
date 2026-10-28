# CRM Imobiliário — Andressa Spagnol Imóveis

Sistema CRM customizado de **alta velocidade e custo zero de infraestrutura**, projetado para uso mobile durante visitas e gestão de leads, captações de imóveis e integração automática com pastas do Google Drive.

## Arquitetura (Custo Zero)
- **Frontend:** Single Page Application (SPA) em HTML5, CSS3 e JavaScript modular (ES Modules), hospedada gratuitamente via **GitHub Pages**.
- **Backend & Autenticação:** **Supabase** (PostgreSQL + Supabase Auth v2 + Row Level Security).
- **Armazenamento de Fotos/Documentos:** **Google Drive** integrado via Webhook no **Google Apps Script**.

## Estrutura de Arquivos
- [`index.html`](./index.html) — Estrutura visual da SPA (Tela de Login, Painel de Leads/Kanban, Captações de Imóveis e Rodapé Oficial).
- [`css/styles.css`](./css/styles.css) — Identidade visual Andressa Spagnol Imóveis (`#3B1425`, branco/cinza claro, fontes Montserrat e Inter).
- [`js/config.js`](./js/config.js) — Bloco isolado de credenciais (`SUPABASE_URL`, `SUPABASE_KEY`, `WEBHOOK_URL`).
- [`js/supabaseClient.js`](./js/supabaseClient.js) — Inicialização do SDK `@supabase/supabase-js` v2.
- [`js/driveService.js`](./js/driveService.js) — Integração com o Webhook do Google Apps Script para criação de pastas no Drive.
- [`js/app.js`](./js/app.js) — Lógica de autenticação, CRUD de clientes e imóveis, Kanban/Lista e notificações.
- [`supabase/schema.sql`](./supabase/schema.sql) — Script SQL completo com tabelas `clientes`, `imoveis` e políticas RLS.
- [`google-apps-script/Code.gs`](./google-apps-script/Code.gs) — Script `doPost(e)` para publicação no `script.google.com`.

