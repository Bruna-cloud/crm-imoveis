-- ============================================================================
-- MIGRAÇÃO V2 - CRM IMOBILIÁRIO ANDRESSA SPAGNOL IMÓVEIS
-- Módulo 1: Refatoração da tabela `clientes` (Meta Ads: primeiro_nome, sobrenome, email)
-- Módulo 2: Criação da tabela `conteudos` (Linha Editorial & IA) + Políticas RLS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- MÓDULO 1: ALTERAÇÃO DA TABELA `clientes`
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Renomeia a coluna `nome` para `primeiro_nome` caso `nome` ainda exista
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
-- MÓDULO 2: CRIAÇÃO DA TABELA `conteudos` (LINHA EDITORIAL & IA)
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

-- Trigger de atualização automática de `updated_at` para `conteudos`
DROP TRIGGER IF EXISTS trg_conteudos_updated_at ON public.conteudos;
CREATE TRIGGER trg_conteudos_updated_at
    BEFORE UPDATE ON public.conteudos
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- POLÍTICAS DE SEGURANÇA (RLS) PARA `conteudos`
-- ----------------------------------------------------------------------------
ALTER TABLE public.conteudos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Conteudos: leitura apenas para autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: leitura apenas para autenticados"
    ON public.conteudos
    FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Conteudos: inserção apenas para autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: inserção apenas para autenticados"
    ON public.conteudos
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Conteudos: atualização apenas para autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: atualização apenas para autenticados"
    ON public.conteudos
    FOR UPDATE
    TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Conteudos: exclusão apenas para autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: exclusão apenas para autenticados"
    ON public.conteudos
    FOR DELETE
    TO authenticated
    USING (auth.uid() IS NOT NULL);
