import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAppContext } from "@/features/app/app-context";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserAvatar } from "@/components/app/user-avatar";
import { useAppStore } from "@/store/useAppStore";
import type { NotificationItem, UserRole } from "@/data/types";
import { isSupabaseProvider } from "@/lib/dataProvider";
import { getSupabaseConfigStatus } from "@/lib/supabaseClient";
import {
  listNotificationsForUser,
  markNotificationReadRemote,
  type NotificationRow,
} from "@/features/notifications/notificationRepository";
import {
  normalizeNotificationTargetRole,
  notificationTargetsUser,
} from "@/features/notifications/notificationAudience";
import {
  filterNegotiationsForUser,
  filterOrdersForUser,
  filterSimulationsForUser,
} from "@/lib/visibility";

type SearchResult = {
  id: string;
  title: string;
  description: string;
  type: "Negociação" | "Simulação" | "Pedido";
  select: () => void;
};

export function AppHeader() {
  const { auth, logout } = useAppContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const user = auth.user;
  const notifications = useAppStore((store) => store.notifications);
  const setNotifications = useAppStore((store) => store.setNotifications);
  const notificationsRef = useRef(notifications);
  const simulations = useAppStore((store) => store.simulations);
  const negotiations = useAppStore((store) => store.negotiations);
  const orders = useAppStore((store) => store.orders);
  const markNotificationRead = useAppStore((store) => store.markNotificationRead);
  const visibleSimulations = useMemo(
    () => filterSimulationsForUser(simulations, user),
    [simulations, user],
  );
  const visibleNegotiations = useMemo(
    () => filterNegotiationsForUser(negotiations, user),
    [negotiations, user],
  );
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, user), [orders, user]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    if (!auth.hasAccess || !isSupabaseProvider() || !getSupabaseConfigStatus().configured) return;

    let cancelled = false;

    async function loadRemoteNotifications() {
      try {
        if (!user) return;
        const data = await listNotificationsForUser(user);
        if (cancelled) return;

        const remoteNotifications = (data ?? []).map(rowToNotification);
        const remoteIds = new Set(remoteNotifications.map((item) => item.id));
        const localOnly = notificationsRef.current.filter((item) => !remoteIds.has(item.id));
        const nextNotifications = [...remoteNotifications, ...localOnly];
        if (!sameNotifications(nextNotifications, notificationsRef.current)) {
          setNotifications(nextNotifications);
        }
      } catch (error) {
        console.warn("Não foi possível carregar notificações do Supabase.", error);
      }
    }

    void loadRemoteNotifications();
    const intervalId = window.setInterval(loadRemoteNotifications, 20000);
    window.addEventListener("focus", loadRemoteNotifications);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", loadRemoteNotifications);
    };
  }, [auth.hasAccess, setNotifications, user]);

  const visibleNotifications = useMemo(
    () => notifications.filter((item) => notificationTargetsUser(item, user)),
    [notifications, user],
  );
  const unread = visibleNotifications.filter((item) => item.unread).length;
  const trimmedQuery = query.trim().toLowerCase();
  const searchResults = useMemo<SearchResult[]>(() => {
    if (trimmedQuery.length < 2) return [];

    const negotiationResults = visibleNegotiations
      .filter((item) =>
        `${item.number} ${item.client} ${item.owner} ${item.stage} ${item.status}`
          .toLowerCase()
          .includes(trimmedQuery),
      )
      .slice(0, 4)
      .map((item) => ({
        id: `negotiation-${item.id}`,
        title: item.number,
        description: `${item.client} • ${item.stage} • ${item.status}`,
        type: "Negociação" as const,
        select: () => navigate({ to: "/negociacoes/$id", params: { id: item.id } }),
      }));

    const simulationResults = visibleSimulations
      .filter((item) =>
        `${item.number} ${item.client} ${item.supplier} ${item.owner} ${item.status}`
          .toLowerCase()
          .includes(trimmedQuery),
      )
      .slice(0, 4)
      .map((item) => ({
        id: `simulation-${item.id}`,
        title: item.number,
        description: `${item.client} • ${item.status}`,
        type: "Simulação" as const,
        select: () => navigate({ to: "/simulacoes/$id", params: { id: item.id } }),
      }));

    const orderResults = visibleOrders
      .filter((item) =>
        `${item.number} ${item.client} ${item.owner} ${item.status}`
          .toLowerCase()
          .includes(trimmedQuery),
      )
      .slice(0, 4)
      .map((item) => ({
        id: `order-${item.id}`,
        title: item.number,
        description: `${item.client} • ${item.status}`,
        type: "Pedido" as const,
        select: () => navigate({ to: "/pedidos/$id", params: { id: item.id } }),
      }));

    return [...negotiationResults, ...simulationResults, ...orderResults].slice(0, 8);
  }, [navigate, trimmedQuery, visibleNegotiations, visibleOrders, visibleSimulations]);

  function selectSearchResult(result: SearchResult) {
    result.select();
    setQuery("");
  }

  function openNotification(item: (typeof notifications)[number]) {
    markNotificationRead(item.id);
    if (isSupabaseProvider() && getSupabaseConfigStatus().configured) {
      void markNotificationReadRemote(item).catch((error) => {
        console.warn("Não foi possível marcar a notificação como lida no Supabase.", error);
      });
    }
    window.setTimeout(() => {
      if (item.entityType === "approval" && item.entityId) {
        if (user?.role === "Admin" || user?.role === "Aprovador" || user?.role === "Financeiro") {
          navigate({ to: "/aprovacoes" });
        } else {
          navigate({ to: "/simulacoes/$id", params: { id: item.entityId } });
        }
        return;
      }
      if (item.entityType === "simulation" && item.entityId) {
        navigate({ to: "/simulacoes/$id", params: { id: item.entityId } });
        return;
      }
      if (item.entityType === "order" && item.entityId) {
        navigate({ to: "/pedidos/$id", params: { id: item.entityId } });
        return;
      }
      if (item.entityType === "negotiation" && item.entityId) {
        navigate({ to: "/negociacoes/$id", params: { id: item.entityId } });
        return;
      }
      if (item.entityType === "freight") {
        navigate({ to: "/fretes" });
        return;
      }
      if (item.href === "/aprovacoes") navigate({ to: "/aprovacoes" });
      if (item.href === "/entregas" || item.href === "/fretes") navigate({ to: "/fretes" });
      if (item.href === "/simulacoes") navigate({ to: "/simulacoes" });
      if (item.href === "/pedidos") navigate({ to: "/pedidos" });
      if (item.href === "/negociacoes") navigate({ to: "/negociacoes" });
    }, 0);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-4 py-3 md:grid-cols-[auto_minmax(280px,680px)_auto] md:gap-3 md:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <SidebarTrigger
            className="h-10 w-10 border border-border md:hidden"
            aria-label="Abrir menu"
          />
        </div>

        <label className="relative block min-w-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Busca global"
            placeholder="Buscar negociações, clientes, pedidos..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchResults[0]) {
                event.preventDefault();
                selectSearchResult(searchResults[0]);
              }
            }}
            className="h-10 rounded-md border-border bg-card pl-10 pr-20 shadow-none"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-xs text-muted-foreground sm:inline">
            Ctrl K
          </span>
          {trimmedQuery.length >= 2 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-card">
              {searchResults.length ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => selectSearchResult(result)}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {result.type}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {result.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {result.description}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  Nenhum resultado encontrado.
                </div>
              )}
            </div>
          ) : null}
        </label>

        <div className="col-span-2 grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 md:col-span-1 md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Notificações"
                className="relative h-10 w-10 bg-card shadow-none"
              >
                <Bell className="h-5 w-5" />
                {unread ? (
                  <span className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                    {unread}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 max-w-[90vw] rounded-2xl p-2">
              <DropdownMenuLabel>Notificações</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {visibleNotifications.length ? (
                visibleNotifications.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      openNotification(item);
                    }}
                    className="items-start rounded-xl px-3 py-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{item.title}</span>
                        {item.unread ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  Nenhuma notificação para sua conta.
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* py-0 + leading-tight: o Button herda py-2, que somado às duas linhas
                  (nome + perfil) estourava a altura fixa de 40px e desalinhava o texto. */}
              <Button
                variant="outline"
                className="grid h-10 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 bg-card px-2.5 py-0 shadow-none"
              >
                <UserAvatar
                  name={user?.name ?? "Usuário"}
                  initials={user?.initials ?? "MF"}
                  className="h-7 w-7"
                />
                <span className="min-w-0 text-left">
                  <span className="block truncate text-sm font-semibold leading-tight text-foreground">
                    {user?.name ?? "Visitante"}
                  </span>
                  <span className="block truncate text-xs leading-tight text-muted-foreground">
                    {user?.role ?? "Sem perfil"}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
              <DropdownMenuItem onClick={() => navigate({ to: "/perfil" })}>
                Meu perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function rowToNotification(row: NotificationRow): NotificationItem {
  const targetRole = normalizeNotificationTargetRole(row.target_role) ?? inferTargetRole(row);
  const entityType = normalizeEntityType(row.entity_type, targetRole);

  return {
    id: row.external_id ?? `remote-${row.id}`,
    remoteId: row.id,
    title: row.title,
    description: row.message,
    type: normalizeNotificationType(row.type),
    createdAt: row.created_at,
    unread: !row.read,
    entityType,
    entityId: row.entity_external_id ?? row.entity_id ?? undefined,
    targetUserId: row.user_id ?? undefined,
    targetUserEmail: row.target_user_email ?? undefined,
    targetUserName: row.target_user_name ?? undefined,
    targetRole,
    source: row.source ?? undefined,
  };
}

function normalizeNotificationType(type: string): NotificationItem["type"] {
  if (type === "success" || type === "warning" || type === "info") return type;
  return "info";
}

function normalizeEntityType(
  entityType: string | null | undefined,
  targetRole?: UserRole,
): NotificationItem["entityType"] | undefined {
  if (targetRole === "Financeiro" && entityType === "simulation") return "approval";
  if (
    entityType === "approval" ||
    entityType === "delivery" ||
    entityType === "freight" ||
    entityType === "simulation" ||
    entityType === "order" ||
    entityType === "negotiation"
  ) {
    return entityType;
  }
  return undefined;
}

function inferTargetRole(row: NotificationRow): UserRole | undefined {
  const text = `${row.title} ${row.message}`.toLowerCase();
  if (text.includes("aguardando aprovação financeira") || text.includes("aguardando financeiro")) {
    return "Financeiro";
  }
  if (
    text.includes("pendente de aprovação") ||
    text.includes("enviada para aprovação") ||
    text.includes("aprovação final") ||
    text.includes("aguarda decisão final") ||
    text.includes("aguardando aprovação do gestor")
  ) {
    return "Admin";
  }
  return undefined;
}

function sameNotifications(left: NotificationItem[], right: NotificationItem[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      item.id === other?.id &&
      item.remoteId === other.remoteId &&
      item.title === other.title &&
      item.description === other.description &&
      item.type === other.type &&
      item.createdAt === other.createdAt &&
      item.unread === other.unread &&
      item.entityType === other.entityType &&
      item.entityId === other.entityId &&
      item.targetUserId === other.targetUserId &&
      item.targetUserEmail === other.targetUserEmail &&
      item.targetUserName === other.targetUserName &&
      item.targetRole === other.targetRole
    );
  });
}
