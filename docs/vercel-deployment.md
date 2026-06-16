# Deploy na Vercel

Este projeto é um app TanStack Start com SSR. O build correto gera a pasta `.vercel/output`, incluindo `config.json` e a função `__server.func`, que é responsável por responder todas as rotas da aplicação.

## Comandos esperados na Vercel

Configure o projeto da Vercel com estes valores quando ele estiver vinculado ao GitHub:

- **Framework Preset:** `TanStack Start`
- **Install Command:** `bun install --frozen-lockfile`
- **Build Command:** `bun run build`
- **Output Directory:** deixe vazio/automático. Não configure `dist`, `build`, `public`, `.` ou `.vercel/output` manualmente.
- **Root Directory:** a raiz deste repositório, onde estão `package.json`, `vite.config.ts` e `vercel.json`.

O arquivo `vite.config.ts` já força o preset Nitro `vercel`, portanto o build deve publicar a saída no formato Build Output API da Vercel.

## Como diagnosticar erro `404: NOT_FOUND` na raiz

Se `https://master-deal-flow.vercel.app/` exibir a tela padrão da Vercel com `404: NOT_FOUND`, isso normalmente indica que a Vercel não está servindo a saída do TanStack Start. Verifique, nesta ordem:

1. A última implantação de **Production** terminou com sucesso e está associada ao domínio `master-deal-flow.vercel.app`.
2. O projeto da Vercel está conectado ao repositório/branch correto do GitHub.
3. O **Root Directory** aponta para a raiz deste repositório.
4. O **Framework Preset** está como `TanStack Start`.
5. O **Output Directory** não foi sobrescrito no painel. Para TanStack Start + Nitro, deixar automático evita servir uma pasta estática vazia.
6. Nos logs de build deve aparecer a geração de `.vercel/output/config.json` e `.vercel/output/functions/__server.func`.

## Validação local

Antes de redeployar, execute:

```bash
bun run build
```

Um build saudável deve finalizar sem erro e gerar `.vercel/output/config.json` com uma rota final encaminhando `/(.*)` para `/__server`.
