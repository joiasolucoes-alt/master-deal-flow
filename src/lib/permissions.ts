import type { Simulation, User, UserRole } from "@/data/types";
import { matchesUserIdentity } from "@/lib/userIdentity";

export type Permission =
  | "dashboard:view"
  | "clients:view"
  | "negotiations:view"
  | "negotiations:manage"
  | "simulations:view"
  | "simulations:create"
  | "simulations:edit-own"
  | "simulations:submit"
  | "adjustments:view"
  | "approvals:view"
  | "approvals:decide"
  | "orders:view"
  | "orders:convert"
  | "finance:view"
  | "freights:view"
  | "deliveries:view"
  | "reports:view"
  | "settings:manage";

const allPermissions: Permission[] = [
  "dashboard:view",
  "clients:view",
  "negotiations:view",
  "negotiations:manage",
  "simulations:view",
  "simulations:create",
  "simulations:edit-own",
  "simulations:submit",
  "adjustments:view",
  "approvals:view",
  "approvals:decide",
  "orders:view",
  "orders:convert",
  "finance:view",
  "freights:view",
  "deliveries:view",
  "reports:view",
  "settings:manage",
];

const permissionsByRole: Record<UserRole, Permission[]> = {
  Comercial: [
    "dashboard:view",
    "clients:view",
    "negotiations:view",
    "negotiations:manage",
    "simulations:view",
    "simulations:create",
    "simulations:edit-own",
    "simulations:submit",
    "adjustments:view",
    "approvals:view",
    "orders:view",
    "deliveries:view",
  ],
  Negociações: [
    "dashboard:view",
    "clients:view",
    "negotiations:view",
    "negotiations:manage",
    "simulations:view",
    "simulations:create",
    "simulations:edit-own",
    "simulations:submit",
    "adjustments:view",
    "orders:view",
  ],
  Aprovador: [
    "dashboard:view",
    "clients:view",
    "simulations:view",
    "approvals:view",
    "approvals:decide",
    "orders:view",
    "orders:convert",
    "reports:view",
  ],
  Financeiro: [
    "dashboard:view",
    "clients:view",
    "orders:view",
    "finance:view",
    "freights:view",
    "reports:view",
  ],
  Admin: allPermissions,
};

const routePermissions: Array<{ prefix: string; permission: Permission }> = [
  { prefix: "/dashboard", permission: "dashboard:view" },
  { prefix: "/clientes", permission: "clients:view" },
  { prefix: "/negociacoes", permission: "negotiations:view" },
  { prefix: "/simulacoes", permission: "simulations:view" },
  { prefix: "/reajustes", permission: "adjustments:view" },
  { prefix: "/aprovacoes", permission: "approvals:view" },
  { prefix: "/pedidos", permission: "orders:view" },
  { prefix: "/financeiro", permission: "finance:view" },
  { prefix: "/fretes", permission: "freights:view" },
  { prefix: "/entregas", permission: "deliveries:view" },
  { prefix: "/relatorios", permission: "reports:view" },
  { prefix: "/configuracoes", permission: "settings:manage" },
];

export function normalizeRole(role: string): UserRole {
  if (role === "Aprovação") return "Aprovador";
  if (
    role === "Comercial" ||
    role === "Negociações" ||
    role === "Aprovador" ||
    role === "Financeiro" ||
    role === "Admin"
  ) {
    return role;
  }
  return "Comercial";
}

export function hasPermission(user: User | null | undefined, permission: Permission) {
  if (!user) return false;
  if (user.status !== "Ativo") return false;
  return permissionsByRole[normalizeRole(user.role)].includes(permission);
}

export function canAccessPath(user: User | null | undefined, pathname: string) {
  const route = routePermissions.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
  );
  return route ? hasPermission(user, route.permission) : true;
}

export function isPendingApprovalStatus(status: Simulation["status"]) {
  return (
    status === "Pendente de aprovação" ||
    status === "Em análise" ||
    status === "Aguardando aprovação do Gestor" ||
    status === "Aguardando pagamento" ||
    status === "Pagamento realizado" ||
    status === "Comprovante anexado" ||
    status === "Aguardando validação comercial"
  );
}

export function isSimulationOwner(user: User | null | undefined, simulation: Simulation) {
  return matchesUserIdentity(simulation.owner, user);
}

export function canCreateSimulation(user: User | null | undefined) {
  return hasPermission(user, "simulations:create");
}

export function canEditSimulation(user: User | null | undefined, simulation: Simulation) {
  if (!user) return false;
  if (normalizeRole(user.role) === "Admin") return true;
  if (!hasPermission(user, "simulations:edit-own")) return false;
  if (!isSimulationOwner(user, simulation)) return false;
  return (
    simulation.status === "Rascunho" ||
    simulation.status === "Ajuste solicitado" ||
    simulation.status === "Aguardando validação comercial"
  );
}

export function canSubmitSimulationForApproval(
  user: User | null | undefined,
  simulation: Simulation,
) {
  return hasPermission(user, "simulations:submit") && canEditSimulation(user, simulation);
}

export function canReviewApprovals(user: User | null | undefined) {
  return hasPermission(user, "approvals:decide");
}

export function canApproveSimulation(user: User | null | undefined, simulation: Simulation) {
  return canReviewApprovals(user) && !isSimulationOwner(user, simulation);
}

export function canConvertSimulationToOrder(user: User | null | undefined) {
  return hasPermission(user, "orders:convert");
}
