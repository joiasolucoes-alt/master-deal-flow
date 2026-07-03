-- Nome da alteração: Correção do status de fretes
-- Objetivo: permitir que o app salve fretes usando os status operacionais da Onda 2.
-- Motivo: o SQL do rastreamento público restringiu a tabela freights e deixou de aceitar
-- os status usados pelo app: quoted, hired, loading e in_route.
-- Pode rodar em produção? Sim.
-- Como validar: após rodar, acessar Fretes e gerar frete a partir de pedido liberado.

alter table public.freights drop constraint if exists freights_status_driver_tracking_check;

alter table public.freights add constraint freights_status_driver_tracking_check
  check (status in (
    'quoted',
    'hired',
    'loading',
    'in_route',
    'delivered',
    'cancelled',
    'contracted',
    'arrived_pickup',
    'loaded',
    'in_transit',
    'completed',
    'Cotação',
    'Aprovado',
    'Em rota',
    'Entregue'
  ));
