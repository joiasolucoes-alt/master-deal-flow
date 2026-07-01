import { useEffect } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppHeader } from "@/components/app/app-header";
import { LoadingState } from "@/components/app/loading-state";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/features/app/app-context";
import { canAccessPath } from "@/lib/permissions";

export function AppShell() {
  const { hydrated, auth, logout } = useAppContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isCheckingInitialAuth = !hydrated || (auth.isLoading && !auth.isAuthenticated);

  useEffect(() => {
    if (hydrated && !auth.isLoading && !auth.isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [auth.isAuthenticated, auth.isLoading, hydrated, navigate]);

  useEffect(() => {
    if (hydrated && auth.hasAccess && !canAccessPath(auth.user, pathname)) {
      navigate({ to: "/dashboard" });
    }
  }, [auth.hasAccess, auth.user, hydrated, navigate, pathname]);

  if (isCheckingInitialAuth) {
    return (
      <div className="min-h-dvh bg-background p-6">
        <LoadingState title="Inicializando Master Flow" />
      </div>
    );
  }

  if (!auth.isAuthenticated) return null;

  if (!auth.hasAccess) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <h1 className="text-xl font-semibold text-foreground">Usuário sem permissão</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {auth.accessError ?? "Usuário autenticado, mas sem acesso ao Master Flow."}
          </p>
          <Button className="mt-6" onClick={logout}>
            Sair e tentar outra conta
          </Button>
        </div>
      </div>
    );
  }

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
