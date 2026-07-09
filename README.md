# Master Flow

Plataforma interna de gestão comercial da Master Distribuidora e Logística:
simulações, aprovações, pedidos, frete e entregas em um fluxo único.

Stack: React 19 + TanStack Start/Router + Tailwind v4 (shadcn) + Supabase, com [Bun](https://bun.sh) como gerenciador de pacotes.

## Pré-requisitos

- [Bun](https://bun.sh) (o projeto usa `bun.lock`)
- Node.js >= 22.12.0

## Configuração

> ⚠️ **Importante:** o arquivo `.env` **não é versionado** (está no `.gitignore`).
> Ele **não vem no clone** e **é removido do working tree ao dar `git pull`** de
> um commit que o apagou. Se o app não conectar ao Supabase ("Erro de conexão"
> ou login que nunca completa), quase sempre é o `.env` faltando — recrie-o.

1. Instale as dependências:

   ```bash
   bun install
   ```

2. Crie o arquivo `.env` na raiz (a partir do `.env.example`) com as credenciais do Supabase:

   ```bash
   VITE_DATA_PROVIDER=supabase
   VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
   VITE_SUPABASE_ANON_KEY=<sua-publishable-key>
   ```

   Para rodar apenas com os dados de exemplo locais (sem Supabase), use
   `VITE_DATA_PROVIDER=local` — nesse modo valem os usuários semente de
   `src/data/users.ts` (ex.: `admin@masterflow.com.br` / `admin`). Veja
   [docs/data-provider.md](docs/data-provider.md) para detalhes.

3. Suba o servidor de desenvolvimento:

   ```bash
   bun run dev
   ```

## Scripts

| Comando | Descrição |
| --- | --- |
| `bun run dev` | Servidor de desenvolvimento (Vite) |
| `bun run build` | Build de produção |
| `bun run preview` | Preview do build |
| `bun run typecheck` | Checagem de tipos (`tsc --noEmit`) |
| `bun run lint` | ESLint |
| `bun run format` | Prettier (`--write`) |
| `bun run test` | Testes |
