import type { NotificationItem } from "./types";

export const notifications: NotificationItem[] = [
  {
    id: "not-1",
    title: "Nova aprovação pendente",
    description: "SIM-2026-0128 aguarda validação do aprovador responsável.",
    type: "warning",
    createdAt: "2026-06-16T08:40:00-03:00",
    unread: true,
    href: "/aprovacoes",
    entityType: "approval",
  },
  {
    id: "not-2",
    title: "Pedido em rota",
    description: "PED-2026-0041 saiu para entrega em Juiz de Fora.",
    type: "info",
    createdAt: "2026-06-16T07:25:00-03:00",
    unread: true,
    href: "/entregas",
    entityType: "delivery",
  },
  {
    id: "not-3",
    title: "Simulação aprovada",
    description: "SIM-2026-0126 foi aprovada e está pronta para conversão em pedido.",
    type: "success",
    createdAt: "2026-06-15T18:10:00-03:00",
    unread: false,
    href: "/simulacoes",
    entityType: "simulation",
  },
];
