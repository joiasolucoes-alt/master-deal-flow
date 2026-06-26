import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppContext } from "@/features/app/app-context";
import logoAsset from "@/assets/logo-master.png.asset.json";
import truckIllustration from "@/assets/master-flow-truck.png";
import { notifyActionUnavailable } from "@/lib/actions";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, registerUser, auth, hydrated } = useAppContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@masterflow.com.br");
  const [password, setPassword] = useState("admin");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registerName, setRegisterName] = useState("");

  useEffect(() => {
    if (hydrated && auth.isAuthenticated) navigate({ to: "/dashboard" });
  }, [hydrated, auth.isAuthenticated, navigate]);

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="h-12 w-10 overflow-hidden rounded-md">
            <img
              src={logoAsset.url}
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
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === "register") {
              if (!registerName.trim() || !email.trim() || !password.trim()) {
                toast.error("Informe nome, e-mail e senha para criar a conta.");
                return;
              }
              if (password !== confirmPassword) {
                toast.error("As senhas não conferem.");
                return;
              }

              const result = registerUser({
                name: registerName,
                email,
                password,
              });
              if (result.ok) {
                toast.success(result.message);
                navigate({ to: "/dashboard" });
                return;
              }
              toast.error(result.message);
              return;
            }

            if (!email.trim() || !password.trim()) {
              toast.error("Informe e-mail e senha para continuar.");
              return;
            }
            const result = login(email, password);
            if (!result.ok) {
              toast.error(result.message);
              return;
            }
            navigate({ to: "/dashboard" });
          }}
          className="w-full max-w-md space-y-6"
        >
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Bem-vindo de volta
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Acesse sua conta para continuar gerenciando suas negociações."
                : "Crie sua conta com e-mail e senha. O perfil inicial será Comercial."}
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/30 p-1">
              <Button
                type="button"
                variant={mode === "login" ? "default" : "ghost"}
                onClick={() => {
                  setMode("login");
                  setEmail("admin@masterflow.com.br");
                  setPassword("admin");
                  setConfirmPassword("");
                }}
              >
                Entrar
              </Button>
              <Button
                type="button"
                variant={mode === "register" ? "default" : "ghost"}
                onClick={() => {
                  setMode("register");
                  setEmail("");
                  setPassword("");
                  setConfirmPassword("");
                }}
              >
                Cadastrar
              </Button>
            </div>

            {mode === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="register-name">Nome completo</Label>
                <Input
                  id="register-name"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

            {mode === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            ) : null}

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

          <Button type="submit" className="h-12 w-full text-base">
            {mode === "login" ? "Entrar" : "Criar conta"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Ao continuar você concorda com as políticas internas da Master Distribuidora.
          </p>
        </form>
      </main>
    </div>
  );
}
