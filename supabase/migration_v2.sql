-- ============================================================================
-- MIGRAÇÃO V2/V3 - CRM IMOBILIÁRIO ANDRESSA SPAGNOL IMÓVEIS
-- Módulo 1: Refatoração da tabela `clientes` (Meta Ads: primeiro_nome, sobrenome, email)
-- Módulo 2: Criação da tabela `conteudos` (Linha Editorial) e `ia_referencias` (Base de Refs da IA)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- MÓDULO 1: ALTERAÇÃO DA TABELA `clientes`
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'clientes'
          AND column_name = 'nome'
    ) THEN
        ALTER TABLE public.clientes RENAME COLUMN nome TO primeiro_nome;
    END IF;
END $$;

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS sobrenome TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';

-- ----------------------------------------------------------------------------
-- MÓDULO 2A: CRIAÇÃO DA TABELA `conteudos` (LINHA EDITORIAL & IA)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conteudos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tema TEXT NOT NULL CHECK (char_length(trim(tema)) > 0),
    formato TEXT NOT NULL DEFAULT 'Reels',
    data_gravacao DATE,
    status TEXT NOT NULL DEFAULT 'Ideia' CHECK (
        status IN (
            'Ideia',
            'Gravar',
            'Editar',
            'Pronto',
            'Postado'
        )
    ),
    roteiro TEXT,
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conteudos_created_at ON public.conteudos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conteudos_status ON public.conteudos (status);

DROP TRIGGER IF EXISTS trg_conteudos_updated_at ON public.conteudos;
CREATE TRIGGER trg_conteudos_updated_at
    BEFORE UPDATE ON public.conteudos
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- MÓDULO 2B: CRIAÇÃO DA TABELA `ia_referencias` (PERFIS DO INSTAGRAM & REFS FIXAS DA IA)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_referencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_instagram TEXT NOT NULL CHECK (char_length(trim(perfil_instagram)) > 0),
    estilo_o_que_gosto TEXT NOT NULL,
    exemplo_post TEXT DEFAULT '',
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- POLÍTICAS DE SEGURANÇA (RLS) PARA `conteudos` E `ia_referencias`
-- ----------------------------------------------------------------------------
ALTER TABLE public.conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_referencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Conteudos: leitura apenas para autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: leitura apenas para autenticados"
    ON public.conteudos FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Conteudos: inserção apenas para autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: inserção apenas para autenticados"
    ON public.conteudos FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Conteudos: atualização apenas para autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: atualização apenas para autenticados"
    ON public.conteudos FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Conteudos: exclusão apenas para autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: exclusão apenas para autenticados"
    ON public.conteudos FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Referencias IA: acesso total para autenticados" ON public.ia_referencias;
CREATE POLICY "Referencias IA: acesso total para autenticados"
    ON public.ia_referencias FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================================================
-- MÓDULO 4: TABELA `tarefas` + FOREIGN KEY `cliente_id` (AÇÕES VINCULADAS 2 EM 1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tarefas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL CHECK (char_length(trim(titulo)) > 0),
    data_vencimento DATE,
    concluida BOOLEAN NOT NULL DEFAULT false,
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adiciona a Foreign Key `cliente_id` referenciando `public.clientes(id)`
ALTER TABLE public.tarefas
    ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_cliente_id ON public.tarefas (cliente_id);

-- Atualiza a constraint de `status_funil` em `clientes` para suportar também 'Proposta' e 'Fechado'
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_status_funil_check;
ALTER TABLE public.clientes
    ADD CONSTRAINT clientes_status_funil_check CHECK (
        status_funil IN (
            'Prospecção',
            'Visita Agendada',
            'Proposta',
            'Proposta em Andamento',
            'Fechado'
        )
    );

-- RLS para `tarefas`
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tarefas: acesso total para autenticados" ON public.tarefas;
CREATE POLICY "Tarefas: acesso total para autenticados"
    ON public.tarefas
    FOR ALL
    TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- MÓDULO 5: OBSERVAÇÃO & TAGGING EM `clientes` + CENTRAL DE NOTIFICAÇÕES
-- ============================================================================

-- 4.1 Novas colunas na tabela `clientes`: `observacao` e `usuario_marcado`
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS observacao TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS usuario_marcado TEXT DEFAULT '';

-- 5.1 Criação da tabela `notificacoes`
CREATE TABLE IF NOT EXISTS public.notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mensagem TEXT NOT NULL CHECK (char_length(trim(mensagem)) > 0),
    lida BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_lida_created ON public.notificacoes (lida, created_at DESC);

-- RLS para `notificacoes`
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notificacoes: acesso total para autenticados" ON public.notificacoes;
CREATE POLICY "Notificacoes: acesso total para autenticados"
    ON public.notificacoes
    FOR ALL
    TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- FASE 2: MOTOR DE GESTÃO DE PROJETOS IMOBILIÁRIOS (TABELA `clientes`)
-- ============================================================================

-- Remove a constraint fixa antiga de `status_funil` para permitir os pipelines dinâmicos por serviço
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_status_funil_check;

-- Adiciona as 6 novas colunas do Gestor de Projetos na tabela `clientes`
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS tipo_servico TEXT DEFAULT 'Compra',
    ADD COLUMN IF NOT EXISTS links_imoveis TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS observacoes_visitas TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS checklist_docs JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS responsavel_contrato TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS link_drive_cliente TEXT DEFAULT '';
