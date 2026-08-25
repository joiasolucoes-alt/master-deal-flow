-- Nome da alteração: Onda 4 - cobertura de prejuízo com o Pool de Oportunidades
-- Objetivo: permitir que somente o Admin use saldo do Pool para cobrir prejuízo
-- reconhecido como responsabilidade da Master, sem alterar o resultado realizado.
-- Dependências: SQL 036 e SQL 037.
-- Como usar: executar manualmente no SQL Editor do Supabase antes de publicar o frontend.
-- Risco: baixo; adiciona colunas e cria uma operação transacional e idempotente.

begin;

alter table public.negotiation_wallets
  add column if not exists pool_coverage_amount numeric(14,2) not null default 0,
  add column if not exists pool_coverage_reason text,
  add column if not exists pool_covered_by_text text,
  add column if not exists pool_covered_at timestamptz;

alter table public.negotiation_wallets
  drop constraint if exists negotiation_wallets_pool_coverage_amount_check;

alter table public.negotiation_wallets
  add constraint negotiation_wallets_pool_coverage_amount_check
  check (pool_coverage_amount >= 0);

create or replace function public.cover_wallet_loss_with_opportunity_pool(
  p_wallet_external_id text,
  p_pool_external_id text,
  p_amount numeric,
  p_reason text,
  p_request_external_id text,
  p_decided_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.negotiation_wallets%rowtype;
  v_pool public.opportunity_pools%rowtype;
  v_loss numeric(14,2);
  v_covered numeric(14,2);
  v_remaining numeric(14,2);
  v_pool_balance numeric(14,2);
  v_entry_external_id text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if coalesce(trim(p_request_external_id), '') = '' then
    raise exception 'request identifier is required';
  end if;

  v_entry_external_id := 'pool-loss-coverage-' || trim(p_request_external_id);

  -- Uma repetição da mesma solicitação não gera um segundo débito.
  if exists (
    select 1
      from public.opportunity_pool_entries ope
     where ope.external_id = v_entry_external_id
  ) then
    return jsonb_build_object('status', 'already_applied');
  end if;

  select nw.*
    into v_wallet
    from public.negotiation_wallets nw
   where nw.external_id = p_wallet_external_id
     and exists (
       select 1
         from public.organization_members om
        where om.organization_id = nw.organization_id
          and om.user_id = auth.uid()
          and lower(coalesce(om.role, '')) = 'admin'
     )
   for update;

  if v_wallet.id is null then
    raise exception 'wallet not found or admin access denied';
  end if;

  if v_wallet.status <> 'closed' then
    raise exception 'wallet must be closed before loss coverage';
  end if;

  if v_wallet.management_decision <> 'loss_acknowledged'
     or v_wallet.loss_owner <> 'Master' then
    raise exception 'only losses assigned to Master can use the pool';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'coverage reason is required';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'coverage amount must be greater than zero';
  end if;

  v_loss := greatest(0, -coalesce(v_wallet.final_balance, v_wallet.current_balance, 0));
  v_covered := greatest(0, coalesce(v_wallet.pool_coverage_amount, 0));
  v_remaining := greatest(0, v_loss - v_covered);

  if p_amount > v_remaining then
    raise exception 'coverage amount exceeds remaining loss';
  end if;

  select op.*
    into v_pool
    from public.opportunity_pools op
   where op.organization_id = v_wallet.organization_id
     and op.external_id = p_pool_external_id
     and op.status = 'active'
   limit 1
   for update;

  if v_pool.id is null then
    raise exception 'active opportunity pool not found';
  end if;

  select coalesce(
           sum(case when ope.direction = 'credit' then ope.amount else -ope.amount end),
           0
         )
    into v_pool_balance
    from public.opportunity_pool_entries ope
   where ope.pool_id = v_pool.id;

  if p_amount > v_pool_balance then
    raise exception 'opportunity pool has insufficient balance';
  end if;

  insert into public.opportunity_pool_entries (
    external_id,
    pool_id,
    pool_external_id,
    wallet_id,
    wallet_external_id,
    organization_id,
    amount,
    direction,
    description,
    created_by_text,
    created_at,
    metadata
  ) values (
    v_entry_external_id,
    v_pool.id,
    v_pool.external_id,
    v_wallet.id,
    v_wallet.external_id,
    v_wallet.organization_id,
    round(p_amount, 2),
    'debit',
    'Compensação do prejuízo da carteira ' || v_wallet.external_id || '.',
    coalesce(nullif(trim(p_decided_by), ''), 'Admin'),
    now(),
    jsonb_build_object(
      'order_external_id', v_wallet.order_external_id,
      'reason', trim(p_reason),
      'coverage_before', v_covered,
      'coverage_after', v_covered + round(p_amount, 2),
      'request_id', trim(p_request_external_id)
    )
  );

  update public.negotiation_wallets
     set pool_coverage_amount = v_covered + round(p_amount, 2),
         pool_coverage_reason = trim(p_reason),
         pool_covered_by_text = coalesce(nullif(trim(p_decided_by), ''), 'Admin'),
         pool_covered_at = now(),
         updated_at = now()
   where id = v_wallet.id;

  update public.opportunity_pools op
     set balance = coalesce((
           select sum(case when ope.direction = 'credit' then ope.amount else -ope.amount end)
             from public.opportunity_pool_entries ope
            where ope.pool_id = v_pool.id
         ), 0),
         updated_at = now()
   where op.id = v_pool.id;

  return jsonb_build_object(
    'status', 'applied',
    'wallet_external_id', v_wallet.external_id,
    'pool_external_id', v_pool.external_id,
    'amount', round(p_amount, 2),
    'remaining_loss', greatest(0, v_remaining - round(p_amount, 2))
  );
end;
$$;

revoke all on function public.cover_wallet_loss_with_opportunity_pool(
  text, text, numeric, text, text, text
) from public;
grant execute on function public.cover_wallet_loss_with_opportunity_pool(
  text, text, numeric, text, text, text
) to authenticated;

notify pgrst, 'reload schema';

commit;
