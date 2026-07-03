import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppContext } from "@/features/app/app-context";
import truckDarkAsset from "@/assets/master-truck-dark.png.asset.json";
import truckLightAsset from "@/assets/master-truck-light.png.asset.json";
import { notifyActionUnavailable } from "@/lib/actions";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, auth, hydrated } = useAppContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (hydrated && auth.isAuthenticated && auth.hasAccess) navigate({ to: "/dashboard" });
  }, [hydrated, auth.hasAccess, auth.isAuthenticated, navigate]);

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="h-12 w-10 overflow-hidden rounded-md">
            <img
              src="/logo-master.svg"
              alt="Master"
              className="h-full max-w-none object-cover object-left"
            />
          </div>
          <div>
            <p className="text-2xl font-semibold leading-none">master</p>
            <p className="text-2xl font-semibold leading-none text-primary">Flow</p>
          </div>
        </div>
        <div className="space-y-6">
          <img src={truckIllustration} alt="Caminhão Master" className="mx-auto w-2/3" />
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold">Gestão completa de negociações</h2>
            <p className="text-sidebar-foreground/70">
              Simule, aprove e acompanhe pedidos em uma única plataforma — do orçamento à entrega.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-sidebar-foreground/70">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Plataforma interna Master Distribuidora e Logística
        </div>
      </aside>

      <main className="grid place-items-center px-6 py-12">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!email.trim() || !password.trim()) {
              toast.error("E-mail e senha são obrigatórios.");
              return;
            }

            setIsSubmitting(true);
            try {
              const result = await login(email, password);
              if (!result.ok) {
                toast.error(result.message);
                return;
              }
              navigate({ to: "/dashboard" });
            } finally {
              setIsSubmitting(false);
            }
          }}
          className="w-full max-w-md space-y-6"
        >
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Bem-vindo MasterFlow
            </h1>
            <p className="text-sm text-muted-foreground">
              Acesse sua conta para continuar gerenciando suas negociações.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Mostrar senha"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                Manter conectado
              </label>
              <button
                type="button"
                onClick={() => notifyActionUnavailable("Recuperação de senha")}
                className="text-sm font-medium text-primary hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
          </div>

          {auth.accessError ? <p className="text-sm text-destructive">{auth.accessError}</p> : null}

          <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
            {isSubmitting ? "Autenticando..." : "Entrar"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Ao continuar você concorda com as políticas internas da Master Distribuidora.
          </p>
        </form>
      </main>
    </div>
  );
}
