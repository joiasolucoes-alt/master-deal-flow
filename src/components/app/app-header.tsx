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
import { notifications } from "@/data/notifications";
import { useAppContext } from "@/features/app/app-context";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserAvatar } from "@/components/app/user-avatar";

export function AppHeader() {
  const { auth, logout } = useAppContext();
  const user = auth.user;
  const unread = notifications.filter((item) => item.unread).length;

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
            className="h-12 rounded-2xl border-border bg-card pl-11 pr-24 shadow-card"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-xs text-muted-foreground sm:inline">
            ⌘ K
          </span>
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
                <DropdownMenuItem key={item.id} className="items-start rounded-xl px-3 py-3">
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
              <DropdownMenuLabel>{user?.unit}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Meu perfil</DropdownMenuItem>
              <DropdownMenuItem>Preferências</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
