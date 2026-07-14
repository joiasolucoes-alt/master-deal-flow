import type { NotificationItem, User, UserRole } from "@/data/types";
import { normalizeRole } from "@/lib/permissions";
import { matchesUserIdentity } from "@/lib/userIdentity";

export function normalizeNotificationTargetRole(
  targetRole: string | null | undefined,
): UserRole | undefined {
  const normalized = targetRole?.trim().toLowerCase();
  if (normalized === "admin" || normalized === "adm" || normalized === "gestor") {
    return "Admin";
  }
  if (normalized === "aprovador" || normalized === "aprovação" || normalized === "aprovacao") {
    return "Aprovador";
  }
  if (normalized === "financeiro") return "Financeiro";
  if (
    normalized === "frete" ||
    normalized === "frota" ||
    normalized === "logística" ||
    normalized === "logistica"
  ) {
    return "Frete";
  }
  if (normalized === "comercial") return "Comercial";
  if (normalized === "negociações" || normalized === "negociacoes") return "Negociações";
  return undefined;
}

export function notificationTargetsUser(
  notification: NotificationItem,
  user: User | null | undefined,
) {
  if (!user) return false;

  const targetRole = normalizeNotificationTargetRole(notification.targetRole);
  const hasIndividualTarget = Boolean(
    notification.targetUserId || notification.targetUserEmail || notification.targetUserName,
  );
  const matchesIndividualTarget = Boolean(
    (notification.targetUserId && notification.targetUserId === user.id) ||
    (notification.targetUserEmail &&
      notification.targetUserEmail.trim().toLowerCase() === user.email.trim().toLowerCase()) ||
    (notification.targetUserName && matchesUserIdentity(notification.targetUserName, user)),
  );

  if (hasIndividualTarget) {
    return matchesIndividualTarget && (!targetRole || targetRole === normalizeRole(user.role));
  }
  if (targetRole) return targetRole === normalizeRole(user.role);

  // Registros muito antigos não possuem destinatário. Permanecem restritos ao Admin.
  return normalizeRole(user.role) === "Admin";
}
