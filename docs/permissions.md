# Permissões

## Perfis atuais

- `Comercial`: cria, edita e envia simulações próprias. Acompanha seus pedidos e entregas.
- `Negociações`: acompanha e gerencia negociações/simulações comerciais.
- `Aprovador`: acessa aprovações, aprova, devolve ou reprova simulações de outros usuários.
- `Financeiro`: acessa visão financeira e relatórios liberados.
- `Admin`: acesso total ao frontend, cadastros e configurações.

## Regras no frontend

- O menu só mostra áreas liberadas para o perfil.
- Rotas restritas redirecionam para o dashboard.
- Comercial só vê seus próprios fluxos.
- Admin vê todos os fluxos.
- Aprovador não deve aprovar simulação criada por ele mesmo.

## RLS no Supabase

RLS significa Row Level Security. Em termos simples, é a trava do banco que define quem pode ler ou alterar cada linha.

Nesta Onda 1.1, o script manual `supabase/manual-sql/003_basic_rls_for_homologation.sql` prepara políticas simples para homologação.

As regras definitivas por perfil, unidade e responsável devem ser refinadas depois, quando a operação real de usuários estiver fechada.
