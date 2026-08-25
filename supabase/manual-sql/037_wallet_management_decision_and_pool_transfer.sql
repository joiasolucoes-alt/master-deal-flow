-- Nome da alteração: Onda 3 - decisão gerencial da carteira e transferência atômica ao Pool
-- Objetivo: registrar a decisão do Admin sobre saldo positivo/prejuízo e transferir
-- Carteira + Pool na mesma transação, sem duplicar créditos.
-- Dependências: SQL 036.
-- Como usar: executar manualmente no SQL Editor do Supabase antes de publicar o frontend.
-- Risco: baixo; adiciona colunas, faz backfill apenas de carteiras já transferidas e cria RPC.

begin;

alter table public.negotiation_wallets
  add column if not exists management_decision text not null default 'pending',
  add column if not exists management_decision_reason text,
  add column if not exists management_decided_by_text text,
  add column if not exists management_decided_at timestamptz,
  add column if not exists loss_owner text;

alter table public.negotiation_wallets
  drop constraint if exists negotiation_wallets_management_decision_check,
  drop constraint if exists negotiation_wallets_loss_owner_check;

alter table public.negotiation_wallets
  add constraint negotiation_wallets_management_decision_check
  check (management_decision in (
    'pending',
    'approved_for_pool',
    'retained',
    'loss_acknowledged',
    'zero_acknowledged'
  )),
  add constraint negotiation_wallets_loss_owner_check
  check (loss_owner is null or loss_owner in (
    'Master',
    'Comercial',
    'Transportadora',
    'Fornecedor',
    'Outro'
  ));

-- Carteiras transferidas antes desta onda já tiveram, na prática, aprovação para o Pool.
update public.negotiation_wallets
   set management_decision = 'approved_for_pool',
       management_decision_reason = coalesce(
         management_decision_reason,
         'Transferência realizada antes da implantação da decisão gerencial.'
       ),
       management_decided_by_text = coalesce(management_decided_by_text, 'Migração SQL 037'),
       management_decided_at = coalesce(management_decided_at, closed_at, updated_at, now())
 where status = 'transferred'
   and management_decision = 'pending';

-- Materializa no Pool as transferências antigas que antes existiam apenas no
-- status da carteira. O external_id estável torna este backfill idempotente.
do $$
declare
  v_wallet public.negotiation_wallets%rowtype;
  v_pool_id uuid;
  v_pool_external_id text;
begin
  for v_wallet in
    select nw.*
      from public.negotiation_wallets nw
     where nw.status = 'transferred'
       and coalesce(nw.final_balance, nw.current_balance, 0) > 0
  loop
    select op.id, op.external_id
      into v_pool_id, v_pool_external_id
      from public.opportunity_pools op
     where op.organization_id = v_wallet.organization_id
     order by op.created_at
     limit 1;

    if v_pool_id is null then
      v_pool_external_id := case
        when exists (
          select 1 from public.opportunity_pools where external_id = 'pool-geral'
        ) then 'pool-geral-' || replace(v_wallet.organization_id::text, '-', '')
        else 'pool-geral'
      end;

      insert into public.opportunity_pools (
        external_id,
        organization_id,
        name,
        description,
        balance,
        status,
        created_at,
        updated_at
      ) values (
        v_pool_external_id,
        v_wallet.organization_id,
        'Resultado Acumulado',
        'Saldos positivos aprovados das carteiras de negociação.',
        0,
        'active',
        now(),
        now()
      )
      returning id into v_pool_id;
    end if;

    if not exists (
      select 1
        from public.opportunity_pool_entries ope
       where ope.external_id = 'pool-transfer-' || coalesce(v_wallet.external_id, v_wallet.id::text)
    ) then
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
        'pool-transfer-' || coalesce(v_wallet.external_id, v_wallet.id::text),
        v_pool_id,
        v_pool_external_id,
        v_wallet.id,
        v_wallet.external_id,
        v_wallet.organization_id,
        coalesce(v_wallet.final_balance, v_wallet.current_balance),
        'credit',
        'Saldo positivo aprovado da carteira ' || coalesce(v_wallet.external_id, v_wallet.id::text) || '.',
        coalesce(v_wallet.management_decided_by_text, 'Migração SQL 037'),
        coalesce(v_wallet.management_decided_at, v_wallet.closed_at, now()),
        jsonb_build_object(
          'order_external_id', v_wallet.order_external_id,
          'decision_reason', v_wallet.management_decision_reason,
          'backfilled_by', 'SQL 037'
        )
      );
    end if;
  end loop;

  update public.opportunity_pools op
     set balance = coalesce((
           select sum(case when ope.direction = 'credit' then ope.amount else -ope.amount end)
             from public.opportunity_pool_entries ope
            where ope.pool_id = op.id
         ), 0),
         updated_at = now();
end $$;

create or replace function public.transfer_negotiation_wallet_to_pool(
  p_wallet_external_id text,
  p_pool_external_id text default 'pool-geral',
  p_decided_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.negotiation_wallets%rowtype;
  v_pool_id uuid;
  v_entry_id uuid;
  v_amount numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'authentication required';
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

  if v_wallet.status not in ('closed', 'transferred') then
    raise exception 'wallet must be closed before transfer';
  end if;

  v_amount := coalesce(v_wallet.final_balance, v_wallet.current_balance, 0);
  if v_amount <= 0 then
    raise exception 'only positive balances can be transferred';
  end if;

  if v_wallet.management_decision <> 'approved_for_pool' then
    raise exception 'wallet balance must be approved for the pool';
  end if;

  select op.id
    into v_pool_id
    from public.opportunity_pools op
   where op.organization_id = v_wallet.organization_id
     and op.external_id = coalesce(nullif(trim(p_pool_external_id), ''), 'pool-geral')
   limit 1
   for update;

  if v_pool_id is null then
    insert into public.opportunity_pools (
      external_id,
      organization_id,
      name,
      description,
      balance,
      status,
      created_at,
      updated_at
    ) values (
      coalesce(nullif(trim(p_pool_external_id), ''), 'pool-geral'),
      v_wallet.organization_id,
      'Resultado Acumulado',
      'Saldos positivos aprovados das carteiras de negociação.',
      0,
      'active',
      now(),
      now()
    )
    returning id into v_pool_id;
  end if;

  select ope.id
    into v_entry_id
    from public.opportunity_pool_entries ope
   where ope.external_id = 'pool-transfer-' || v_wallet.external_id
   limit 1;

  if v_entry_id is null then
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
      'pool-transfer-' || v_wallet.external_id,
      v_pool_id,
      coalesce(nullif(trim(p_pool_external_id), ''), 'pool-geral'),
      v_wallet.id,
      v_wallet.external_id,
      v_wallet.organization_id,
      v_amount,
      'credit',
      'Saldo positivo aprovado da carteira ' || v_wallet.external_id || '.',
      coalesce(nullif(trim(p_decided_by), ''), v_wallet.management_decided_by_text, 'Admin'),
      now(),
      jsonb_build_object(
        'order_external_id', v_wallet.order_external_id,
        'decision_reason', v_wallet.management_decision_reason,
        'decided_at', v_wallet.management_decided_at
      )
    );
  else
    update public.opportunity_pool_entries
       set pool_id = v_pool_id,
           amount = v_amount,
           description = 'Saldo positivo aprovado da carteira ' || v_wallet.external_id || '.',
           created_by_text = coalesce(
             nullif(trim(p_decided_by), ''),
             v_wallet.management_decided_by_text,
             created_by_text,
             'Admin'
           ),
           metadata = jsonb_build_object(
             'order_external_id', v_wallet.order_external_id,
             'decision_reason', v_wallet.management_decision_reason,
             'decided_at', v_wallet.management_decided_at
           )
     where id = v_entry_id;
  end if;

  update public.opportunity_pools op
     set balance = coalesce((
           select sum(case when ope.direction = 'credit' then ope.amount else -ope.amount end)
             from public.opportunity_pool_entries ope
            where ope.pool_id = op.id
         ), 0),
         updated_at = now()
   where op.id = v_pool_id;

  update public.negotiation_wallets
     set status = 'transferred',
         updated_at = now()
   where id = v_wallet.id;

  return jsonb_build_object(
    'wallet_external_id', v_wallet.external_id,
    'pool_id', v_pool_id,
    'amount', v_amount,
    'status', 'transferred'
  );
end;
$$;

revoke all on function public.transfer_negotiation_wallet_to_pool(text, text, text) from public;
grant execute on function public.transfer_negotiation_wallet_to_pool(text, text, text)
to authenticated;

notify pgrst, 'reload schema';

commit;
