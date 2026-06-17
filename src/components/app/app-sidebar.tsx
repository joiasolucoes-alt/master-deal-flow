import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  ChevronLeft,
  ClipboardCheck,
  FileChartColumn,
  Handshake,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";
import truckIllustration from "@/assets/master-flow-truck.png";
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

function isNavigationItemActive(currentPath: string, itemPath: string) {
  if (itemPath === "/dashboard") return currentPath === itemPath;
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

const navigation = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { title: "Negociações", to: "/negociacoes", icon: Handshake },
  { title: "Simulações", to: "/simulacoes", icon: BriefcaseBusiness },
  { title: "Aprovações", to: "/aprovacoes", icon: ClipboardCheck },
  { title: "Pedidos", to: "/pedidos", icon: Boxes },
  { title: "Financeiro", to: "/financeiro", icon: Wallet },
  { title: "Fretes", to: "/fretes", icon: Truck },
  { title: "Entregas", to: "/entregas", icon: PackageSearch },
  { title: "Relatórios", to: "/relatorios", icon: FileChartColumn },
  { title: "Configurações", to: "/configuracoes", icon: Settings },
] as const;

export function AppSidebar() {
  const currentPath = useRouterState({ select: (state) => state.location.pathname });
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-3 overflow-hidden rounded-2xl px-1 py-1">
          <div className="h-11 w-9 shrink-0 overflow-hidden rounded-md">
            <img
              src="/logo-master.svg"
              alt="Logo Master Flow"
              className="h-full max-w-none object-cover object-left"
              loading="lazy"
            />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-[1.85rem] font-semibold leading-none text-sidebar-foreground">
                master
              </p>
              <p className="truncate text-[1.85rem] font-semibold leading-none text-primary">
                Flow
              </p>
            </div>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu>
          {navigation.map((item) => {
            const active = isNavigationItemActive(currentPath, item.to);
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className="h-12 rounded-2xl px-3 text-[0.95rem]"
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

      <SidebarFooter className="gap-3 px-3 pb-4">
        <div className="overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar-elevated p-3 text-sidebar-foreground shadow-card group-data-[collapsible=icon]:p-2">
          <div className="flex items-start gap-3 group-data-[collapsible=icon]:justify-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary ring-1 ring-primary/15">
              <ShieldCheck className="h-5 w-5" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground/75">
                  Sistema operacional
                </p>
                <p className="text-sm font-semibold text-sidebar-foreground">Todos os serviços</p>
                <p className="text-sm text-primary">operando normalmente</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-sidebar-border bg-sidebar-elevated/70 group-data-[collapsible=icon]:rounded-2xl">
          <img
            src={truckIllustration}
            alt="Ilustração de caminhão"
            className="h-28 w-full object-contain object-bottom px-3 pt-3 opacity-85 group-data-[collapsible=icon]:h-20 group-data-[collapsible=icon]:px-1"
            loading="lazy"
            width={1024}
            height={1024}
          />
        </div>

        <Button
          variant="ghost"
          onClick={toggleSidebar}
          className="h-11 w-full justify-center rounded-full border border-sidebar-border bg-sidebar-elevated text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronLeft className="h-4 w-4 group-data-[collapsible=icon]:rotate-180" />
          {!collapsed ? <span>Recolher menu</span> : null}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
