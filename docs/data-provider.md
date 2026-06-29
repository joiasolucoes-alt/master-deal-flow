# Data provider

O Master Flow agora tem uma camada de dados para alternar entre armazenamento local e Supabase.

## Provider local

Configuracao:

```env
VITE_DATA_PROVIDER=local
```

Neste modo, o app usa a store atual persistida no navegador. E o modo padrao e continua funcionando offline.

## Provider Supabase

Configuracao:

```env
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

Neste modo, ao abrir o app:

1. O frontend tenta carregar simulacoes e pedidos do Supabase.
2. Se conseguir, substitui a base local pela base remota.
3. Ao salvar simulacao ou pedido, atualiza a tela local primeiro e grava no Supabase em seguida.
4. Se a gravacao falhar, a tela continua funcionando com os dados locais e mostra aviso.

## Fluxos conectados

Com `VITE_DATA_PROVIDER=supabase`, a camada atual cobre:

- listar simulacoes
- buscar simulacao por ID
- salvar rascunho ou edicao de simulacao
- duplicar simulacao, porque a duplicacao salva como nova simulacao
- enviar para aprovacao, porque altera status e salva
- aprovar/devolver/reprovar, porque altera status e salva
- converter simulacao aprovada em pedido
- listar pedidos
- salvar pedido
- bloquear conversao duplicada no repositorio de pedidos
- registrar historico basico
- criar notificacoes basicas

## Fallback

Fallback significa plano B.

Se o Supabase nao estiver configurado ou falhar, o app mantem a experiencia atual com dados locais para nao travar o teste funcional.

## Pontos provisorios

- Login real com Supabase Auth ainda nao substituiu o login simulado.
- Permissoes por perfil ainda nao foram levadas para RLS.
- Regras por unidade/responsavel ainda nao foram aplicadas no banco.
- A tela de notificacoes ainda usa a estrutura atual; o Supabase ja recebe registros basicos.
