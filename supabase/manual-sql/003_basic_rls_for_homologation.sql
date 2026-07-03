-- Nome da alteração: RLS básica para homologação da Onda 1.1
-- Objetivo: Preparar políticas simples para usuários autenticados no fluxo comercial até pedido.
-- Motivo: Reforçar no banco as mesmas áreas usadas pelo frontend durante homologação.
-- Risco: Médio; políticas de RLS afetam leitura/escrita. Validar em preview antes de produção crítica.
-- Pode rodar em produção? Sim, com validação prévia
-- Dependências: Tabelas da migration inicial já existentes e Supabase Auth configurado.
-- Como validar: Entrar com usuário autenticado, criar simulação, aprovar e converter em pedido.
-- Reversão sugerida: Dropar as policies com prefixo wave_1_1_ e restaurar políticas anteriores.

alter table public.clients enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.simulations enable row level security;
alter table public.simulation_items enable row level security;
alter table public.simulation_costs enable row level security;
alter table public.simulation_purchase_costs enable row level security;
alter table public.simulation_installments enable row level security;
alter table public.approvals enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;

drop policy if exists wave_1_1_read_clients on public.clients;
create policy wave_1_1_read_clients on public.clients for select to authenticated using (true);
drop policy if exists wave_1_1_write_clients on public.clients;
create policy wave_1_1_write_clients on public.clients for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_suppliers on public.suppliers;
create policy wave_1_1_read_suppliers on public.suppliers for select to authenticated using (true);
drop policy if exists wave_1_1_write_suppliers on public.suppliers;
create policy wave_1_1_write_suppliers on public.suppliers for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_products on public.products;
create policy wave_1_1_read_products on public.products for select to authenticated using (true);
drop policy if exists wave_1_1_write_products on public.products;
create policy wave_1_1_write_products on public.products for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_simulations on public.simulations;
create policy wave_1_1_read_simulations on public.simulations for select to authenticated using (true);
drop policy if exists wave_1_1_write_simulations on public.simulations;
create policy wave_1_1_write_simulations on public.simulations for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_simulation_items on public.simulation_items;
create policy wave_1_1_read_simulation_items on public.simulation_items for select to authenticated using (true);
drop policy if exists wave_1_1_write_simulation_items on public.simulation_items;
create policy wave_1_1_write_simulation_items on public.simulation_items for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_simulation_costs on public.simulation_costs;
create policy wave_1_1_read_simulation_costs on public.simulation_costs for select to authenticated using (true);
drop policy if exists wave_1_1_write_simulation_costs on public.simulation_costs;
create policy wave_1_1_write_simulation_costs on public.simulation_costs for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_simulation_purchase_costs on public.simulation_purchase_costs;
create policy wave_1_1_read_simulation_purchase_costs on public.simulation_purchase_costs for select to authenticated using (true);
drop policy if exists wave_1_1_write_simulation_purchase_costs on public.simulation_purchase_costs;
create policy wave_1_1_write_simulation_purchase_costs on public.simulation_purchase_costs for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_simulation_installments on public.simulation_installments;
create policy wave_1_1_read_simulation_installments on public.simulation_installments for select to authenticated using (true);
drop policy if exists wave_1_1_write_simulation_installments on public.simulation_installments;
create policy wave_1_1_write_simulation_installments on public.simulation_installments for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_approvals on public.approvals;
create policy wave_1_1_read_approvals on public.approvals for select to authenticated using (true);
drop policy if exists wave_1_1_write_approvals on public.approvals;
create policy wave_1_1_write_approvals on public.approvals for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_orders on public.orders;
create policy wave_1_1_read_orders on public.orders for select to authenticated using (true);
drop policy if exists wave_1_1_write_orders on public.orders;
create policy wave_1_1_write_orders on public.orders for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_order_items on public.order_items;
create policy wave_1_1_read_order_items on public.order_items for select to authenticated using (true);
drop policy if exists wave_1_1_write_order_items on public.order_items;
create policy wave_1_1_write_order_items on public.order_items for all to authenticated using (true) with check (true);

drop policy if exists wave_1_1_read_audit_events on public.audit_events;
create policy wave_1_1_read_audit_events on public.audit_events for select to authenticated using (true);
drop policy if exists wave_1_1_insert_audit_events on public.audit_events;
create policy wave_1_1_insert_audit_events on public.audit_events for insert to authenticated with check (true);

drop policy if exists wave_1_1_read_notifications on public.notifications;
create policy wave_1_1_read_notifications on public.notifications for select to authenticated using (true);
drop policy if exists wave_1_1_write_notifications on public.notifications;
create policy wave_1_1_write_notifications on public.notifications for all to authenticated using (true) with check (true);
