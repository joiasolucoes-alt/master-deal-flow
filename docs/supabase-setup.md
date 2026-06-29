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

## 6. Falhas esperadas

Se `VITE_DATA_PROVIDER=supabase` estiver ativo sem URL ou anon key, o app mostra aviso no console/toast e preserva o funcionamento local.

Se o Supabase estiver configurado, mas Auth/RLS bloquear o acesso, o app mantem os dados locais e mostra erro amigavel.
