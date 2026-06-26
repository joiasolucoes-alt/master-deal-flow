import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/features/app/app-context";
import { UserAvatar } from "@/components/app/user-avatar";
import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import type { UserRole, UserStatus } from "@/data/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { auth, users, updateUserAccess, themeMode, setThemeMode } = useAppContext();
  const user = auth.user;
  const roleOptions: UserRole[] = ["Comercial", "Negociações", "Aprovador", "Financeiro", "Admin"];
  const statusOptions: UserStatus[] = ["Ativo", "Bloqueado"];

  function changeUserAccess(id: string, payload: { role?: UserRole; status?: UserStatus }) {
    updateUserAccess(id, payload);
    toast.success("Acesso do usuário atualizado.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie preferências, usuários e parâmetros do Master Flow."
      />

      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="space-y-4 pt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Informações pessoais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input defaultValue={user?.name} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input defaultValue={user?.email} />
              </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Input defaultValue={user?.role} />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input defaultValue={user?.unit} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="empresa" className="space-y-4 pt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Dados da empresa</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Razão social</Label>
                <Input defaultValue="Master Distribuidora e Logística S.A." />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input defaultValue="00.000.000/0001-00" />
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input defaultValue="Av. Industrial, 1500 — Cataguases / MG" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input defaultValue="(32) 3000-0000" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Parâmetros comerciais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Margem mínima</Label>
                <Input defaultValue={`${String(MINIMUM_MARGIN_TARGET).replace(".", ",")}%`} />
              </div>
              <div className="space-y-2">
                <Label>Margem de alerta</Label>
                <Input defaultValue={`${String(ATTENTION_MARGIN_TARGET).replace(".", ",")}%`} />
              </div>
              <div className="space-y-2">
                <Label>Comissão padrão</Label>
                <Input defaultValue="2,5%" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios" className="space-y-4 pt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Equipe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="grid gap-4 rounded-2xl border border-border p-3 lg:grid-cols-[1fr_180px_160px_auto]"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar name={u.name} initials={u.initials} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{u.name}</p>
                        <Badge
                          variant={u.status === "Bloqueado" ? "destructive" : "outline"}
                          className={
                            u.status === "Ativo"
                              ? "border-success/30 bg-success-soft text-success"
                              : undefined
                          }
                        >
                          {u.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                      <p className="text-sm text-muted-foreground">{u.unit}</p>
                    </div>
                  </div>

                  <Select
                    value={u.role}
                    onValueChange={(role) =>
                      changeUserAccess(u.id, { role: role as UserRole })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={u.status}
                    onValueChange={(status) =>
                      changeUserAccess(u.id, { status: status as UserStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {u.status !== "Ativo" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changeUserAccess(u.id, { status: "Ativo" })}
                    >
                      Desbloquear
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changeUserAccess(u.id, { status: "Bloqueado" })}
                    >
                      Bloquear
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferencias" className="space-y-4 pt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Aparência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Tema da aplicação</p>
                  <p className="text-sm text-muted-foreground">
                    Escolha entre claro, escuro ou seguir o sistema.
                  </p>
                </div>
                <div className="flex gap-2">
                  {(["light", "dark", "system"] as const).map((mode) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={themeMode === mode ? "default" : "outline"}
                      onClick={() => setThemeMode(mode)}
                    >
                      {mode === "light" ? "Claro" : mode === "dark" ? "Escuro" : "Sistema"}
                    </Button>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Notificações por e-mail</p>
                  <p className="text-sm text-muted-foreground">
                    Receba resumos diários das aprovações pendentes.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Alertas em tempo real</p>
                  <p className="text-sm text-muted-foreground">
                    Avisos sobre mudanças de status críticos.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
