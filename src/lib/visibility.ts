import type { FreightRecord, Negotiation, Order, Simulation, User } from "@/data/types";
import { isPendingApprovalStatus, normalizeRole } from "@/lib/permissions";
import { matchesUserIdentity } from "@/lib/userIdentity";

export function canViewAllFlows(user: User | null | undefined) {
  return normalizeRole(user?.role ?? "Comercial") === "Admin";
}

export function canViewOperationalQueues(user: User | null | undefined) {
  const role = normalizeRole(user?.role ?? "Comercial");
  return role === "Admin" || role === "Financeiro" || role === "Aprovador" || role === "Frete";
}

export function belongsToUser(owner: string | null | undefined, user: User | null | undefined) {
  return matchesUserIdentity(owner, user);
}

export function filterSimulationsForUser(simulations: Simulation[], user: User | null | undefined) {
  if (canViewAllFlows(user)) return simulations;
  const role = normalizeRole(user?.role ?? "Comercial");
  return simulations.filter((simulation) => {
    if (belongsToUser(simulation.owner, user)) return true;
    if (
      (role === "Financeiro" || role === "Aprovador") &&
      isPendingApprovalStatus(simulation.status)
    ) {
      return true;
    }
    return false;
  });
}

export function filterOrdersForUser(orders: Order[], user: User | null | undefined) {
  if (canViewOperationalQueues(user)) return orders;
  return orders.filter((order) => belongsToUser(order.owner, user));
}

export function filterNegotiationsForUser(
  negotiations: Negotiation[],
  user: User | null | undefined,
) {
  if (canViewAllFlows(user)) return negotiations;
  return negotiations.filter((negotiation) => belongsToUser(negotiation.owner, user));
}

/**
 * Filas de frete. Perfis operacionais (Admin, Financeiro, Aprovador e Frete)
 * enxergam TODOS os fretes — inclusive os de "preparação" gerados a partir de
 * simulações aprovadas pelo Gestor (que ainda não têm `orderId`). Os demais
 * perfis só veem fretes de pedidos que já podem visualizar ou de que são donos.
 */
export function filterFreightsForUser(
  freights: FreightRecord[],
  orders: Order[],
  user: User | null | undefined,
) {
  if (canViewOperationalQueues(user)) return freights;
  const visibleOrderIds = new Set(filterOrdersForUser(orders, user).map((order) => order.id));
  return freights.filter(
    (freight) => visibleOrderIds.has(freight.orderId ?? "") || belongsToUser(freight.owner, user),
  );
}
