import { useMemo, useState } from "react";
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
  const simulations = useAppStore((store) => store.simulations);
  const negotiations = useAppStore((store) => store.negotiations);
  const orders = useAppStore((store) => store.orders);
  const markNotificationRead = useAppStore((store) => store.markNotificationRead);
  const unread = notifications.filter((item) => item.unread).length;
  const trimmedQuery = query.trim().toLowerCase();
  const searchResults = useMemo<SearchResult[]>(() => {
    if (trimmedQuery.length < 2) return [];

    const negotiationResults = negotiations
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
        select: () => navigate({ to: "/negociacoes" }),
      }));

    const simulationResults = simulations
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

    const orderResults = orders
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
  }, [negotiations, navigate, orders, simulations, trimmedQuery]);

  function selectSearchResult(result: SearchResult) {
    result.select();
    setQuery("");
  }

  function openNotification(item: (typeof notifications)[number]) {
    markNotificationRead(item.id);
    if (item.href === "/aprovacoes") navigate({ to: "/aprovacoes" });
    if (item.href === "/entregas") navigate({ to: "/entregas" });
    if (item.href === "/simulacoes") navigate({ to: "/simulacoes" });
    if (item.href === "/pedidos") navigate({ to: "/pedidos" });
    if (item.href === "/negociacoes") navigate({ to: "/negociacoes" });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="grid gap-3 px-4 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <SidebarTrigger
            className="h-10 w-10 rounded-full border border-border md:hidden"
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
            className="h-12 rounded-2xl border-border bg-card pl-11 pr-24 shadow-card"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-xs text-muted-foreground sm:inline">
            ⌘ K
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

        <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Notificações"
                className="relative h-12 w-12 rounded-2xl bg-card shadow-card"
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
              {notifications.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => openNotification(item)}
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
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="grid h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-card px-3 shadow-card"
              >
                <UserAvatar
                  name={user?.name ?? "Usuário"}
                  initials={user?.initials ?? "MF"}
                  className="h-9 w-9"
                />
                <span className="min-w-0 text-left">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {user?.name ?? "Visitante"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
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
