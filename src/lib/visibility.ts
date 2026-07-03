import type { Negotiation, Order, Simulation, User } from "@/data/types";
import { normalizeRole } from "@/lib/permissions";

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export function canViewAllFlows(user: User | null | undefined) {
  return normalizeRole(user?.role ?? "Comercial") === "Admin";
}

export function canViewOperationalQueues(user: User | null | undefined) {
  const role = normalizeRole(user?.role ?? "Comercial");
  return role === "Admin" || role === "Financeiro" || role === "Aprovador";
}

export function belongsToUser(owner: string | null | undefined, user: User | null | undefined) {
  if (!user) return false;
  const normalizedOwner = normalize(owner);
  return normalizedOwner === normalize(user.name) || normalizedOwner === normalize(user.email);
}

export function filterSimulationsForUser(simulations: Simulation[], user: User | null | undefined) {
  if (canViewAllFlows(user)) return simulations;
  const role = normalizeRole(user?.role ?? "Comercial");
  return simulations.filter((simulation) => {
    if (belongsToUser(simulation.owner, user)) return true;
    if (
      (role === "Financeiro" || role === "Aprovador") &&
      (simulation.status === "Pendente de aprovação" || simulation.status === "Em análise")
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
