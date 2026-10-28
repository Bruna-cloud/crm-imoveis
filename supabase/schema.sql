-- ============================================================================
-- CRM IMOBILIÁRIO - ANDRESSA SPAGNOL IMÓVEIS (SCHEMA COMPLETO V2/V3)
-- Inclui: clientes (Meta Ads), imoveis (Drive), conteudos e ia_referencias (IA)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABELA: clientes
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primeiro_nome TEXT NOT NULL CHECK (char_length(trim(primeiro_nome)) > 0),
    sobrenome TEXT DEFAULT '',
    email TEXT DEFAULT '',
    telefone TEXT NOT NULL CHECK (char_length(trim(telefone)) > 0),
    status_funil TEXT NOT NULL DEFAULT 'Prospecção' CHECK (
        status_funil IN ('Prospecção', 'Visita Agendada', 'Proposta em Andamento')
    ),
    perfil_interesse TEXT,
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_created_at ON public.clientes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clientes_status_funil ON public.clientes (status_funil);

-- 2. TABELA: imoveis
CREATE TABLE IF NOT EXISTS public.imoveis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL CHECK (char_length(trim(titulo)) > 0),
    valor NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
    status_marketing TEXT NOT NULL DEFAULT '1. Fazer Fotos' CHECK (
        status_marketing IN ('1. Fazer Fotos', '2. Pronto para Postar', '3. Anunciado', '4. Vendido')
    ),
    link_drive_fotos TEXT,
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imoveis_created_at ON public.imoveis (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imoveis_status_marketing ON public.imoveis (status_marketing);

-- 3. TABELA: conteudos
CREATE TABLE IF NOT EXISTS public.conteudos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tema TEXT NOT NULL CHECK (char_length(trim(tema)) > 0),
    formato TEXT NOT NULL DEFAULT 'Reels',
    data_gravacao DATE,
    status TEXT NOT NULL DEFAULT 'Ideia' CHECK (
        status IN ('Ideia', 'Gravar', 'Editar', 'Pronto', 'Postado')
    ),
    roteiro TEXT,
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conteudos_created_at ON public.conteudos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conteudos_status ON public.conteudos (status);

-- 4. TABELA: ia_referencias (Perfis de Instagram e Referências pré-setadas para a IA)
CREATE TABLE IF NOT EXISTS public.ia_referencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_instagram TEXT NOT NULL CHECK (char_length(trim(perfil_instagram)) > 0),
    estilo_o_que_gosto TEXT NOT NULL,
    exemplo_post TEXT DEFAULT '',
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TRIGGER updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_updated_at ON public.clientes;
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_imoveis_updated_at ON public.imoveis;
CREATE TRIGGER trg_imoveis_updated_at BEFORE UPDATE ON public.imoveis FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_conteudos_updated_at ON public.conteudos;
CREATE TRIGGER trg_conteudos_updated_at BEFORE UPDATE ON public.conteudos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imoveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_referencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clientes: acesso autenticados" ON public.clientes;
CREATE POLICY "Clientes: acesso autenticados" ON public.clientes FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Imoveis: acesso autenticados" ON public.imoveis;
CREATE POLICY "Imoveis: acesso autenticados" ON public.imoveis FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Conteudos: acesso autenticados" ON public.conteudos;
CREATE POLICY "Conteudos: acesso autenticados" ON public.conteudos FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Referencias IA: acesso total para autenticados" ON public.ia_referencias;
CREATE POLICY "Referencias IA: acesso total para autenticados" ON public.ia_referencias FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
