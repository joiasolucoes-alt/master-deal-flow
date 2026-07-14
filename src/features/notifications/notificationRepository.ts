import type { NotificationItem } from "@/data/types";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let result = await client.from("notifications").upsert(row, { onConflict: "external_id" });

  // Compatibilidade com bancos que já possuem target_role (onda 028), mas ainda
  // não receberam as colunas de destinatário individual da migração nova.
  if (result.error) {
    const compatibleRow = { ...row };
    delete compatibleRow.target_user_email;
    delete compatibleRow.target_user_name;
    result = await client
      .from("notifications")
      .upsert(compatibleRow, { onConflict: "external_id" });
  }

  if (result.error) throw result.error;
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
