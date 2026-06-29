insert into public.units (external_id, name, city, state)
values
  ('unit-matriz-cataguases', 'Matriz Cataguases', 'Cataguases', 'MG'),
  ('unit-filial-es', 'Filial Espírito Santo', 'Vitória', 'ES'),
  ('unit-filial-rj', 'Filial Rio de Janeiro', 'Rio de Janeiro', 'RJ')
on conflict (external_id) do update set
  name = excluded.name,
  city = excluded.city,
  state = excluded.state;

insert into public.clients (external_id, code, name, city, state)
values
  ('client-big-mais', 'CLI-001', 'BIG MAIS', 'Cataguases', 'MG'),
  ('client-mercado-bom-lar', 'CLI-002', 'Mercado Bom Lar', 'Rio de Janeiro', 'RJ'),
  ('client-rede-ponto-certo', 'CLI-003', 'Rede Ponto Certo', 'Vitória', 'ES')
on conflict (external_id) do update set
  code = excluded.code,
  name = excluded.name,
  city = excluded.city,
  state = excluded.state;

insert into public.suppliers (external_id, code, name, city, state)
values
  ('supplier-moura', 'FOR-001', 'MOURA', 'Cataguases', 'MG'),
  ('supplier-siderurgica-nacional', 'FOR-002', 'Siderúrgica Nacional', 'Belo Horizonte', 'MG'),
  ('supplier-distribuidora-serra', 'FOR-003', 'Distribuidora Serra', 'Serra', 'ES')
on conflict (external_id) do update set
  code = excluded.code,
  name = excluded.name,
  city = excluded.city,
  state = excluded.state;

insert into public.products (external_id, code, description, units_per_box, default_unit_cost, default_sale_unit, unit_label)
values
  ('product-sabao-tixan-macci', '0', 'SABAO EM PO TIXAN 2,2KG MACCI', 9, 15.59, 17.99, 'UN'),
  ('product-sabao-tixan-primavera', '0-2', 'SABAO EM PO TIXAN 2,2KG PRIMAVERA', 9, 14.02, 16.99, 'UN'),
  ('product-generico-001', 'PROD-001', 'Produto exemplo', 12, 10, 13.5, 'UN')
on conflict (external_id) do update set
  code = excluded.code,
  description = excluded.description,
  units_per_box = excluded.units_per_box,
  default_unit_cost = excluded.default_unit_cost,
  default_sale_unit = excluded.default_sale_unit,
  unit_label = excluded.unit_label;

insert into public.profiles (external_id, name, email, role, unit_id)
select 'user-admin', 'Admin MasterFlow', 'admin@masterflow.com.br', 'Admin', units.id
from public.units
where units.external_id = 'unit-matriz-cataguases'
on conflict (external_id) do update set
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  unit_id = excluded.unit_id;
