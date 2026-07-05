# Configuracao Supabase

Este projeto continua funcionando com dados locais por padrao. O Supabase entra como provider opcional para persistencia em nuvem.

## 1. Criar projeto

1. Acesse o painel do Supabase.
2. Crie um novo projeto.
3. Copie a Project URL e a anon public key.
4. Nao use service role key no frontend.

## 2. Variaveis de ambiente

Crie `.env.local` na raiz do projeto:

```env
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

Para manter o funcionamento local:

```env
VITE_DATA_PROVIDER=local
```

O arquivo `.env.local` nao deve ser commitado.

## 3. Migrations

Instale e configure o Supabase CLI no ambiente local. Depois execute:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

A migration inicial esta em:

```text
supabase/migrations/202606290001_initial_master_flow_schema.sql
```

## 4. Seeds

Os dados ficticios iniciais estao em:

```text
supabase/seed.sql
```

Eles incluem unidades, clientes, fornecedores, produtos e um perfil de teste sem senha. O login real ainda continua simulado no frontend nesta rodada.

## 5. Autenticacao e RLS

As tabelas usam Row Level Security, ou RLS. Em termos simples: e a regra que define quem pode ler ou alterar dados no banco.

Nesta primeira onda, as politicas permitem leitura, criacao e edicao para usuarios autenticados. Para testar o provider Supabase sem login real, habilite anonymous sign-ins no Supabase Auth ou conecte um usuario autenticado.

As regras por perfil, unidade e responsavel serao refinadas depois.

## Cadastro de novos usuarios

A tela de login permite criar conta com e-mail e senha. O usuario novo nasce como Comercial.

Para esse fluxo funcionar no Supabase, rode tambem:

```text
supabase/manual-sql/014_self_signup_commercial_access.sql
```

Se a regra desejada for criar a conta e entrar imediatamente, desative a confirmacao obrigatoria de e-mail em Authentication > Providers > Email no painel do Supabase. Se a confirmacao estiver ligada, a conta e criada, mas o acesso so acontece depois da confirmacao.

Se aparecer a mensagem "usuario autenticado, mas o acesso Comercial ainda nao foi criado", rode o SQL 014 no Supabase e tente entrar novamente. Esse SQL cria a funcao que vincula o usuario novo na organizacao padrao como Comercial.

## 6. Scripts manuais da Onda 1.1

Nao aplique migrations automaticamente no banco real durante a homologacao. Use o SQL Editor do Supabase e rode, nesta ordem:

```text
1. supabase/manual-sql/001_approval_workflow_hardening.sql
2. supabase/manual-sql/002_catalog_crud_support.sql
3. supabase/manual-sql/003_basic_rls_for_homologation.sql
4. supabase/manual-sql/014_self_signup_commercial_access.sql
```

Cada arquivo possui cabecalho com objetivo, risco, validacao e reversao sugerida.

## 7. Falhas esperadas

Se `VITE_DATA_PROVIDER=supabase` estiver ativo sem URL ou anon key, o app mostra aviso no console/toast e preserva o funcionamento local.

Se o Supabase estiver configurado, mas Auth/RLS bloquear o acesso, o app mantem os dados locais e mostra erro amigavel.
