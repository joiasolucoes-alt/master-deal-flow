import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  BriefcaseBusiness,
  ChevronLeft,
  ClipboardCheck,
  FileChartColumn,
  Handshake,
  LayoutDashboard,
  PackageSearch,
  RotateCcw,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/features/app/app-context";
import { hasPermission, type Permission } from "@/lib/permissions";

function isNavigationItemActive(currentPath: string, itemPath: string) {
  if (itemPath === "/dashboard") return currentPath === itemPath;
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

const navigation: Array<{
  title: string;
  to: string;
  icon: LucideIcon;
  permission: Permission;
}> = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
  { title: "Negociações", to: "/negociacoes", icon: Handshake, permission: "negotiations:view" },
  { title: "Clientes", to: "/clientes", icon: Users, permission: "clients:view" },
  {
    title: "Simulações",
    to: "/simulacoes",
    icon: BriefcaseBusiness,
    permission: "simulations:view",
  },
  {
    title: "Reajustes",
    to: "/reajustes",
    icon: RotateCcw,
    permission: "adjustments:view",
  },
  {
    title: "Aprovações",
    to: "/aprovacoes",
    icon: ClipboardCheck,
    permission: "approvals:view",
  },
  { title: "Pedidos", to: "/pedidos", icon: Boxes, permission: "orders:view" },
  { title: "Financeiro", to: "/financeiro", icon: Wallet, permission: "finance:view" },
  {
    title: "Pool de Oportunidades",
    to: "/pool-oportunidades",
    icon: FileChartColumn,
    permission: "reports:view",
  },
  { title: "Fretes", to: "/fretes", icon: Truck, permission: "freights:view" },
  { title: "Entregas", to: "/entregas", icon: PackageSearch, permission: "deliveries:view" },
  { title: "Relatórios", to: "/relatorios", icon: FileChartColumn, permission: "reports:view" },
  { title: "Configurações", to: "/configuracoes", icon: Settings, permission: "settings:manage" },
] as const;

export function AppSidebar() {
  const currentPath = useRouterState({ select: (state) => state.location.pathname });
  const { auth } = useAppContext();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const visibleNavigation = navigation.filter((item) => hasPermission(auth.user, item.permission));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-3 overflow-hidden px-1">
          <div className="h-10 w-8 shrink-0 overflow-hidden rounded-sm">
            <img
              src="/logo-master.svg"
              alt="Logo Master Flow"
              className="h-full max-w-none object-cover object-left"
              loading="lazy"
            />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="font-display truncate text-lg font-bold leading-tight text-sidebar-foreground">
                Master Flow
              </p>
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/55">
                Operações
              </p>
            </div>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu>
          {visibleNavigation.map((item) => {
            const active = isNavigationItemActive(currentPath, item.to);
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className="h-10 rounded-md px-3 text-sm"
                >
                  <Link to={item.to} className="flex items-center gap-3">
                    <item.icon
                      className={cn(
                        "h-5 w-5",
                        active ? "text-primary" : "text-sidebar-foreground/80",
                      )}
                    />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t border-sidebar-border px-3 py-3">
        <div className="overflow-hidden rounded-md border border-sidebar-border bg-sidebar-elevated p-3 text-sidebar-foreground group-data-[collapsible=icon]:p-2">
          <div className="flex items-start gap-3 group-data-[collapsible=icon]:justify-center">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/12 text-primary ring-1 ring-primary/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">
                  Master Distribuidora
                </p>
                <p className="text-xs text-sidebar-foreground/55">Ambiente corporativo</p>
              </div>
            ) : null}
          </div>
        </div>

        <Button
          variant="ghost"
          onClick={toggleSidebar}
          className="h-9 w-full justify-center border border-sidebar-border bg-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronLeft className="h-4 w-4 group-data-[collapsible=icon]:rotate-180" />
          {!collapsed ? <span>Recolher menu</span> : null}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
