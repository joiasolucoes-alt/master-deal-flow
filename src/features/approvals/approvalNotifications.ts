import type { NotificationItem, Simulation, User } from "@/data/types";
import type { AuditEvent } from "@/store/types";

/**
 * Notificações e auditoria disparadas quando o Gestor aprova a simulação.
 *
 * Regra de negócio (feat: expose approved simulations to freight preparation):
 * ao aprovar, a proposta segue para o Financeiro pagar E fica visível para o
 * Frete/Logística como operação em preparação. Comercial é avisado de que a
 * proposta seguiu para pagamento. A execução do frete continua bloqueada até o
 * pagamento, a validação comercial e a conversão em Pedido.
 */

export function buildGestorApprovalNotifications(
  simulation: Simulation,
  options: { now?: string; idSeed?: string | number } = {},
): NotificationItem[] {
  const createdAt = options.now ?? new Date().toISOString();
  const seed = options.idSeed ?? Date.now();

  return [
    {
      id: `not-${seed}-finance`,
      title: "Simulação aprovada pelo Gestor",
      description: `${simulation.number} foi aprovada e aguarda pagamento do Financeiro.`,
      type: "warning",
      createdAt,
      unread: true,
      entityType: "simulation",
      entityId: simulation.id,
      targetRole: "Financeiro",
    },
    {
      id: `not-${seed}-freight`,
      title: "Nova operação disponível para preparação",
      description: `${simulation.number} foi aprovada pelo Gestor e já aparece em Fretes para preparação logística. Execução bloqueada até virar pedido.`,
      type: "info",
      createdAt,
      unread: true,
      entityType: "simulation",
      entityId: simulation.id,
      targetRole: "Frete",
    },
    {
      id: `not-${seed}-commercial`,
      title: "Simulação aprovada pelo Gestor",
      description: `${simulation.number} foi aprovada e enviada para pagamento financeiro.`,
      type: "success",
      createdAt,
      unread: true,
      entityType: "simulation",
      entityId: simulation.id,
      targetUserName: simulation.owner,
    },
  ];
}

/**
 * Eventos de auditoria da aprovação: registra que o Gestor aprovou e que a
 * operação foi disponibilizada para o Frete em preparação.
 */
export function buildGestorApprovalAudit(
  simulation: Simulation,
  actor: User | null | undefined,
  options: { now?: string; previousStatus?: Simulation["status"] } = {},
): AuditEvent[] {
  const createdAt = options.now ?? new Date().toISOString();
  const userId = actor?.id ?? "system";
  const previousStatus = options.previousStatus ?? "Aguardando aprovação do Gestor";

  return [
    {
      id: `aud-${createdAt}-gestor-approved-${simulation.id}`,
      entityType: "simulation",
      entityId: simulation.id,
      action: "gestor_approved",
      description: `${simulation.number}: Gestor aprovou a simulação. Seguiu para pagamento financeiro.`,
      userId,
      createdAt,
      metadata: {
        role: actor?.role ?? "Aprovador",
        approver: actor?.name ?? actor?.email ?? "Gestor",
        previousStatus,
        newStatus: "Aguardando pagamento",
      },
    },
    {
      id: `aud-${createdAt}-freight-preparation-${simulation.id}`,
      entityType: "simulation",
      entityId: simulation.id,
      action: "freight_preparation_available",
      description: `${simulation.number}: operação disponibilizada para o Frete/Logística em preparação (ainda não virou pedido).`,
      userId,
      createdAt,
      metadata: {
        role: actor?.role ?? "Aprovador",
        previousStatus,
        newStatus: "Aguardando pagamento",
        blockedForExecution: true,
      },
    },
  ];
}
