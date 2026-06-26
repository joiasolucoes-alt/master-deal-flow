import { useEffect } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppHeader } from "@/components/app/app-header";
import { LoadingState } from "@/components/app/loading-state";
import { useAppContext } from "@/features/app/app-context";
import { canAccessPath } from "@/lib/permissions";

export function AppShell() {
  const { hydrated, auth } = useAppContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (hydrated && !auth.isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [auth.isAuthenticated, hydrated, navigate]);

  useEffect(() => {
    if (hydrated && auth.isAuthenticated && !canAccessPath(auth.user, pathname)) {
      navigate({ to: "/dashboard" });
    }
  }, [auth.isAuthenticated, auth.user, hydrated, navigate, pathname]);

  if (!hydrated) {
    return (
      <div className="min-h-dvh bg-background p-6">
        <LoadingState title="Inicializando Master Flow" />
      </div>
    );
  }

  if (!auth.isAuthenticated) return null;

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-dvh w-full bg-shell">
        <AppSidebar />
        <SidebarInset className="min-h-dvh bg-shell">
          <AppHeader />
          <div className="flex-1 p-4 md:p-6 lg:p-8">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
