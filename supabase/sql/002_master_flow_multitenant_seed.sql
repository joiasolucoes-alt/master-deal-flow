-- =====================================================================
-- Seed inicial Master Flow — idempotente
-- Não cria usuários reais; vinculação de membros à org Master deve ser
-- feita manualmente após o primeiro signup.
-- =====================================================================

-- Organização principal
insert into public.organizations (id, name, legal_name)
values ('00000000-0000-0000-0000-00000000m4st'::uuid,
        'Master Distribuidora e Logística',
        'Master Distribuidora e Logística LTDA')
on conflict (id) do update set
  name = excluded.name,
  legal_name = excluded.legal_name;

-- Unidades padrão
insert into public.units (id, external_id, name, city, state, organization_id)
values
  ('00000000-0000-0000-0000-000000000u01'::uuid, 'unit-matriz-cataguases', 'Matriz Cataguases',     'Cataguases',     'MG', '00000000-0000-0000-0000-00000000m4st'::uuid),
  ('00000000-0000-0000-0000-000000000u02'::uuid, 'unit-filial-es',         'Filial Espírito Santo', 'Vitória',        'ES', '00000000-0000-0000-0000-00000000m4st'::uuid),
  ('00000000-0000-0000-0000-000000000u03'::uuid, 'unit-filial-rj',         'Filial Rio de Janeiro', 'Rio de Janeiro', 'RJ', '00000000-0000-0000-0000-00000000m4st'::uuid)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  city = excluded.city,
  state = excluded.state;

-- Clientes fictícios
insert into public.clients (external_id, organization_id, unit_id, code, name, city, state)
values
  ('cli-bom-lar',         '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u01'::uuid, 'CLI-001', 'Mercado Bom Lar',          'Cataguases',     'MG'),
  ('cli-economia',        '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u01'::uuid, 'CLI-002', 'Rede Economia Popular',    'Juiz de Fora',   'MG'),
  ('cli-central',         '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u02'::uuid, 'CLI-003', 'Supermercado Central',     'Vitória',        'ES'),
  ('cli-vale-verde',      '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u02'::uuid, 'CLI-004', 'Atacado Vale Verde',       'Serra',          'ES'),
  ('cli-uniao',           '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u03'::uuid, 'CLI-005', 'Distribuidora União',      'Rio de Janeiro', 'RJ'),
  ('cli-sao-jose',        '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u03'::uuid, 'CLI-006', 'Mercado São José',         'Niterói',        'RJ')
on conflict (external_id) do update set
  name = excluded.name, code = excluded.code,
  city = excluded.city, state = excluded.state,
  organization_id = excluded.organization_id,
  unit_id = excluded.unit_id;

-- Fornecedores fictícios
insert into public.suppliers (external_id, organization_id, unit_id, code, name, city, state)
values
  ('sup-vale-forte',     '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u01'::uuid, 'FOR-001', 'Indústria Vale Forte',       'Ipatinga',        'MG'),
  ('sup-logmix',         '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u01'::uuid, 'FOR-002', 'Logmix Componentes',         'Contagem',        'MG'),
  ('sup-sider-demo',     '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u02'::uuid, 'FOR-003', 'Siderúrgica Nacional Demo',  'Belo Horizonte',  'MG'),
  ('sup-serra-norte',    '00000000-0000-0000-0000-00000000m4st'::uuid, '00000000-0000-0000-0000-000000000u03'::uuid, 'FOR-004', 'Serra Norte Alimentos',      'Vitória',         'ES')
on conflict (external_id) do update set
  name = excluded.name, code = excluded.code,
  organization_id = excluded.organization_id,
  unit_id = excluded.unit_id;

-- Produtos fictícios (vinculados a fornecedores)
insert into public.products (external_id, organization_id, code, description, name, units_per_box, default_unit_cost, default_sale_unit, unit_label)
values
  ('prod-sabao-macci',     '00000000-0000-0000-0000-00000000m4st'::uuid, 'PRD-001', 'SABÃO EM PÓ TIXAN 2,2KG MACCI',     'SABÃO EM PÓ TIXAN 2,2KG MACCI',     9, 15.59, 17.99, 'UN'),
  ('prod-sabao-primavera', '00000000-0000-0000-0000-00000000m4st'::uuid, 'PRD-002', 'SABÃO EM PÓ TIXAN 2,2KG PRIMAVERA', 'SABÃO EM PÓ TIXAN 2,2KG PRIMAVERA', 9, 14.02, 16.99, 'UN'),
  ('prod-arroz-tio',       '00000000-0000-0000-0000-00000000m4st'::uuid, 'PRD-003', 'ARROZ TIPO 1 5KG',                  'ARROZ TIPO 1 5KG',                  6, 22.00, 27.90, 'UN'),
  ('prod-feijao-carioca',  '00000000-0000-0000-0000-00000000m4st'::uuid, 'PRD-004', 'FEIJÃO CARIOCA 1KG',                'FEIJÃO CARIOCA 1KG',                10,  7.40,  9.50, 'UN')
on conflict (external_id) do update set
  description = excluded.description,
  name = excluded.name,
  organization_id = excluded.organization_id,
  units_per_box = excluded.units_per_box,
  default_unit_cost = excluded.default_unit_cost,
  default_sale_unit = excluded.default_sale_unit;
