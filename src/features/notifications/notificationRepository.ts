import type { NotificationItem, User } from "@/data/types";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NotificationRow = {
  id: string;
  external_id?: string | null;
  title: string;
  message: string;
  type: string;
  read: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  entity_external_id?: string | null;
  user_id?: string | null;
  target_role?: string | null;
  target_user_email?: string | null;
  target_user_name?: string | null;
  source?: string | null;
  created_at: string;
};

export async function listNotificationsForUser(user: User): Promise<NotificationRow[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  await ensureSupabaseSession();

  const select = () =>
    client.from("notifications").select("*").order("created_at", { ascending: false }).limit(80);
  const requests = [
    select().in("target_role", getRoleAliases(user.role)),
    select().eq("user_id", user.id),
    select().eq("target_user_email", user.email),
    select().eq("target_user_name", user.name),
  ];

  if (user.role === "Admin") {
    requests.push(
      select()
        .is("target_role", null)
        .is("user_id", null)
        .is("target_user_email", null)
        .is("target_user_name", null),
    );
  }

  const results = await Promise.all(requests);
  const firstError = results.find((result) => result.error)?.error;
  const rows = results.flatMap((result) => (result.error ? [] : (result.data ?? [])));

  if (rows.length === 0 && firstError) {
    // Compatibilidade com bancos anteriores à SQL 031.
    if (isMissingRecipientColumnError(firstError)) {
      const fallback = await select();
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []) as NotificationRow[];
    }
    throw firstError;
  }

  const uniqueRows = new Map<string, NotificationRow>();
  (rows as NotificationRow[]).forEach((row) => uniqueRows.set(row.id, row));
  return [...uniqueRows.values()]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 80);
}

function getRoleAliases(role: User["role"]) {
  if (role === "Admin") return ["Admin", "admin", "ADM", "Gestor", "gestor"];
  if (role === "Aprovador") return ["Aprovador", "aprovador", "Aprovação", "aprovacao"];
  if (role === "Frete") return ["Frete", "frete", "Frota", "frota", "Logística", "logistica"];
  return [role, role.toLowerCase()];
}

export async function persistNotification(notification: NotificationItem) {
  const client = getSupabaseClient();
  if (!client) return;

  await ensureSupabaseSession();

  const row: Record<string, string | boolean | null> = {
    external_id: notification.id,
    user_id:
      notification.targetUserId && UUID_PATTERN.test(notification.targetUserId)
        ? notification.targetUserId
        : null,
    title: notification.title,
    message: notification.description,
    type: notification.type,
    read: !notification.unread,
    entity_type: notification.entityType ?? null,
    entity_external_id: notification.entityId ?? null,
    target_role: notification.targetRole ?? null,
    target_user_email: notification.targetUserEmail ?? null,
    target_user_name: notification.targetUserName ?? null,
    source: notification.source ?? "app",
    created_at: notification.createdAt,
  };

  let result = await client
    .from("notifications")
    .upsert(row as never, { onConflict: "external_id" });

  // Compatibilidade apenas para bancos anteriores à SQL 031. Outros erros não
  // devem ser mascarados por uma segunda tentativa com destinatário incompleto.
  if (isMissingRecipientColumnError(result.error)) {
    const compatibleRow = { ...row };
    delete compatibleRow.target_user_email;
    delete compatibleRow.target_user_name;
    result = await client
      .from("notifications")
      .upsert(compatibleRow as never, { onConflict: "external_id" });
  }

  if (result.error) throw result.error;
}

function isMissingRecipientColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("target_user_email") ||
    message.includes("target_user_name")
  );
}

export async function markNotificationReadRemote(notification: NotificationItem) {
  const client = getSupabaseClient();
  if (!client) return;

  await ensureSupabaseSession();
  const query = client.from("notifications").update({ read: true });
  const result = notification.remoteId
    ? await query.eq("id", notification.remoteId)
    : await query.eq("external_id", notification.id);

  if (result.error) throw result.error;
}
