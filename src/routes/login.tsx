import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChartNoAxesCombined, ClipboardCheck, Eye, EyeOff, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppContext } from "@/features/app/app-context";
import { notifyActionUnavailable } from "@/lib/actions";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const loginHighlights = [
  { icon: ChartNoAxesCombined, label: "Simular", text: "Margem e viabilidade" },
  { icon: ClipboardCheck, label: "Aprovar", text: "Alçadas e decisões" },
  { icon: Truck, label: "Entregar", text: "Pedido e logística" },
] as const;

function LoginPage() {
  const { login, registerUser, auth, hydrated } = useAppContext();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
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
      <aside className="sidebar-surface relative hidden overflow-hidden border-r border-sidebar-border p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--sidebar-foreground)_1px,transparent_1px),linear-gradient(90deg,var(--sidebar-foreground)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="flex items-center gap-3">
          <div className="h-12 w-10 overflow-hidden rounded-md">
            <img
              src="/logo-master.svg"
              alt="Master"
              className="h-full max-w-none object-cover object-left"
            />
          </div>
          <div>
            <p className="font-display text-2xl font-bold leading-none">Master Flow</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/55">
              Gestão comercial
            </p>
          </div>
        </div>
        <div className="relative max-w-xl space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Controle de ponta a ponta
            </p>
            <h2 className="text-4xl font-bold leading-tight">
              Decisões comerciais com mais clareza e velocidade.
            </h2>
            <p className="max-w-lg text-base leading-relaxed text-sidebar-foreground/65">
              Centralize simulações, aprovações, pedidos e entregas em um fluxo operacional único.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {loginHighlights.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-sidebar-border bg-sidebar-elevated/80 p-4"
              >
                <item.icon className="mb-6 h-5 w-5 text-primary" />
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-1 text-xs text-sidebar-foreground/50">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-3 text-sm text-sidebar-foreground/60">
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
              const result =
                mode === "login"
                  ? await login(email, password)
                  : await registerUser({ email, password });
              if (!result.ok) {
                toast.error(result.message);
                return;
              }
              if (mode === "signup") toast.success("Conta criada com perfil Comercial.");
              navigate({ to: "/dashboard" });
            } finally {
              setIsSubmitting(false);
            }
          }}
          className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-7 shadow-elevated sm:p-9"
        >
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground">
              Bem-vindo MasterFlow
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Acesse sua conta para continuar gerenciando suas negociações."
                : "Crie sua conta Comercial para começar a usar o Master Flow."}
            </p>
          </div>

          <div className="grid grid-cols-2 rounded-lg border border-border bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Criar conta
            </button>
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
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
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

            {mode === "login" ? (
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
            ) : null}
          </div>

          {auth.accessError ? <p className="text-sm text-destructive">{auth.accessError}</p> : null}

          <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
            {isSubmitting
              ? mode === "login"
                ? "Autenticando..."
                : "Criando conta..."
              : mode === "login"
                ? "Entrar"
                : "Criar conta"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Ao continuar você concorda com as políticas internas da Master Distribuidora.
          </p>
        </form>
      </main>
    </div>
  );
}
