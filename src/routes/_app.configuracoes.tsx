import { useEffect, useMemo, useState } from "react";
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
import { getDataProvider } from "@/lib/dataProvider";
import { isPendingApprovalStatus } from "@/lib/permissions";
import { getSupabaseClient, getSupabaseConfigStatus } from "@/lib/supabaseClient";
import type { Client, Product, Supplier, UserRole, UserStatus } from "@/data/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const app = useAppContext();
  const {
    auth,
    users,
    clients,
    suppliers,
    products,
    lastDataError,
    updateUserAccess,
    upsertClient,
    upsertSupplier,
    upsertProduct,
    themeMode,
    setThemeMode,
    simulations,
    orders,
  } = app;
  const user = auth.user;
  const roleOptions: UserRole[] = ["Comercial", "Negociações", "Aprovador", "Financeiro", "Admin"];
  const statusOptions: UserStatus[] = ["Ativo", "Bloqueado"];

  async function changeUserAccess(id: string, payload: { role?: UserRole; status?: UserStatus }) {
    const result = await updateUserAccess(id, payload);
    if (result.ok) {
      toast.success("Acesso do usuário atualizado.");
      return;
    }

    toast.error(result.message ?? "Não foi possível atualizar o acesso do usuário.");
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
          <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
          {import.meta.env.DEV ? <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger> : null}
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

        <TabsContent value="cadastros" className="space-y-4 pt-4">
          <CatalogSettings
            clients={clients}
            suppliers={suppliers}
            products={products}
            onSaveClient={upsertClient}
            onSaveSupplier={upsertSupplier}
            onSaveProduct={upsertProduct}
          />
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
                    onValueChange={(role) => changeUserAccess(u.id, { role: role as UserRole })}
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

        {import.meta.env.DEV ? (
          <TabsContent value="diagnostico" className="space-y-4 pt-4">
            <TechnicalDiagnostics
              auth={auth}
              simulationsCount={simulations.length}
              pendingApprovalsCount={
                simulations.filter((simulation) => isPendingApprovalStatus(simulation.status))
                  .length
              }
              ordersCount={orders.length}
              lastDataError={lastDataError}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function CatalogSettings({
  clients,
  suppliers,
  products,
  onSaveClient,
  onSaveSupplier,
  onSaveProduct,
}: {
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  onSaveClient: (client: Client) => void;
  onSaveSupplier: (supplier: Supplier) => void;
  onSaveProduct: (product: Product) => void;
}) {
  return (
    <Tabs defaultValue="clientes">
      <TabsList>
        <TabsTrigger value="clientes">Clientes</TabsTrigger>
        <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
        <TabsTrigger value="produtos">Produtos</TabsTrigger>
      </TabsList>
      <TabsContent value="clientes" className="pt-4">
        <ClientCatalogCard records={clients} onSave={onSaveClient} />
      </TabsContent>
      <TabsContent value="fornecedores" className="pt-4">
        <SupplierCatalogCard records={suppliers} onSave={onSaveSupplier} />
      </TabsContent>
      <TabsContent value="produtos" className="pt-4">
        <ProductCatalogCard records={products} onSave={onSaveProduct} />
      </TabsContent>
    </Tabs>
  );
}

function ClientCatalogCard({
  records,
  onSave,
}: {
  records: Client[];
  onSave: (client: Client) => void;
}) {
  const emptyClient: Client = {
    id: "",
    code: "",
    name: "",
    document: "",
    city: "",
    state: "",
    unit: "Matriz Cataguases",
    active: true,
  };
  const [form, setForm] = useState<Client>(emptyClient);
  const visibleRecords = useMemo(() => records, [records]);

  function submit() {
    if (!form.name.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    onSave({
      ...form,
      id: form.id || `cli-${Date.now()}`,
      name: form.name.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      unit: form.unit.trim() || "Matriz Cataguases",
      active: form.active ?? true,
    });
    setForm(emptyClient);
    toast.success("Cliente salvo.");
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Clientes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Input
            placeholder="Código"
            value={form.code ?? ""}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
          <Input
            placeholder="Cliente"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="md:col-span-2"
          />
          <Input
            placeholder="Cidade"
            value={form.city}
            onChange={(event) => setForm({ ...form, city: event.target.value })}
          />
          <Input
            placeholder="UF"
            value={form.state}
            onChange={(event) => setForm({ ...form, state: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit}>{form.id ? "Salvar alteração" : "Criar cliente"}</Button>
          {form.id ? (
            <Button variant="outline" onClick={() => setForm(emptyClient)}>
              Cancelar edição
            </Button>
          ) : null}
        </div>
        <SimpleCatalogList
          records={visibleRecords}
          getTitle={(item) => item.name}
          getSubtitle={(item) => `${item.city || "Cidade não informada"} • ${item.state || "UF"}`}
          onEdit={setForm}
          onToggle={(item) => onSave({ ...item, active: !(item.active ?? true) })}
        />
      </CardContent>
    </Card>
  );
}

function SupplierCatalogCard({
  records,
  onSave,
}: {
  records: Supplier[];
  onSave: (supplier: Supplier) => void;
}) {
  const emptySupplier: Supplier = {
    id: "",
    code: "",
    name: "",
    document: "",
    city: "",
    state: "",
    active: true,
  };
  const [form, setForm] = useState<Supplier>(emptySupplier);

  function submit() {
    if (!form.name.trim()) {
      toast.error("Informe o nome do fornecedor.");
      return;
    }
    onSave({
      ...form,
      id: form.id || `sup-${Date.now()}`,
      name: form.name.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      active: form.active ?? true,
    });
    setForm(emptySupplier);
    toast.success("Fornecedor salvo.");
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Fornecedores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Input
            placeholder="Código"
            value={form.code ?? ""}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
          <Input
            placeholder="Fornecedor"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="md:col-span-2"
          />
          <Input
            placeholder="Cidade"
            value={form.city}
            onChange={(event) => setForm({ ...form, city: event.target.value })}
          />
          <Input
            placeholder="UF"
            value={form.state}
            onChange={(event) => setForm({ ...form, state: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit}>{form.id ? "Salvar alteração" : "Criar fornecedor"}</Button>
          {form.id ? (
            <Button variant="outline" onClick={() => setForm(emptySupplier)}>
              Cancelar edição
            </Button>
          ) : null}
        </div>
        <SimpleCatalogList
          records={records}
          getTitle={(item) => item.name}
          getSubtitle={(item) => `${item.city || "Cidade não informada"} • ${item.state || "UF"}`}
          onEdit={setForm}
          onToggle={(item) => onSave({ ...item, active: !(item.active ?? true) })}
        />
      </CardContent>
    </Card>
  );
}

function ProductCatalogCard({
  records,
  onSave,
}: {
  records: Product[];
  onSave: (product: Product) => void;
}) {
  const emptyProduct: Product = {
    id: "",
    code: "",
    name: "",
    unitLabel: "UN",
    defaultUnitsPerBox: 1,
    costUnit: 0,
    saleUnit: 0,
    active: true,
  };
  const [form, setForm] = useState<Product>(emptyProduct);

  function submit() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Informe código e produto.");
      return;
    }
    onSave({
      ...form,
      id: form.id || `prod-${Date.now()}`,
      code: form.code.trim(),
      name: form.name.trim(),
      unitLabel: form.unitLabel.trim() || "UN",
      defaultUnitsPerBox: Number(form.defaultUnitsPerBox) || 1,
      costUnit: Number(form.costUnit) || 0,
      saleUnit: Number(form.saleUnit) || 0,
      active: form.active ?? true,
    });
    setForm(emptyProduct);
    toast.success("Produto salvo.");
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Produtos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-6">
          <Input
            placeholder="Código"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
          <Input
            placeholder="Descrição"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="md:col-span-2"
          />
          <Input
            type="number"
            min={1}
            placeholder="Un/cx"
            value={form.defaultUnitsPerBox}
            onChange={(event) =>
              setForm({ ...form, defaultUnitsPerBox: Number(event.target.value) })
            }
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Custo"
            value={form.costUnit}
            onChange={(event) => setForm({ ...form, costUnit: Number(event.target.value) })}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Venda"
            value={form.saleUnit}
            onChange={(event) => setForm({ ...form, saleUnit: Number(event.target.value) })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit}>{form.id ? "Salvar alteração" : "Criar produto"}</Button>
          {form.id ? (
            <Button variant="outline" onClick={() => setForm(emptyProduct)}>
              Cancelar edição
            </Button>
          ) : null}
        </div>
        <SimpleCatalogList
          records={records}
          getTitle={(item) => `${item.code} • ${item.name}`}
          getSubtitle={(item) =>
            `Un/cx: ${item.defaultUnitsPerBox} • Custo: ${item.costUnit.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}`
          }
          onEdit={setForm}
          onToggle={(item) => onSave({ ...item, active: !(item.active ?? true) })}
        />
      </CardContent>
    </Card>
  );
}

function SimpleCatalogList<T extends { id: string; active?: boolean }>({
  records,
  getTitle,
  getSubtitle,
  onEdit,
  onToggle,
}: {
  records: T[];
  getTitle: (record: T) => string;
  getSubtitle: (record: T) => string;
  onEdit: (record: T) => void;
  onToggle: (record: T) => void;
}) {
  return (
    <div className="space-y-2">
      {records.map((record) => {
        const active = record.active ?? true;
        return (
          <div
            key={record.id}
            className="grid gap-3 rounded-2xl border border-border p-3 md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">{getTitle(record)}</p>
                <Badge
                  variant={active ? "outline" : "secondary"}
                  className={active ? "border-success/30 bg-success-soft text-success" : undefined}
                >
                  {active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{getSubtitle(record)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(record)}>
                Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => onToggle(record)}>
                {active ? "Inativar" : "Reativar"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TechnicalDiagnostics({
  auth,
  simulationsCount,
  pendingApprovalsCount,
  ordersCount,
  lastDataError,
}: {
  auth: ReturnType<typeof useAppContext>["auth"];
  simulationsCount: number;
  pendingApprovalsCount: number;
  ordersCount: number;
  lastDataError: string | null;
}) {
  const config = getSupabaseConfigStatus();
  const [connectionStatus, setConnectionStatus] = useState("Não testado");

  useEffect(() => {
    let cancelled = false;
    async function checkConnection() {
      if (!config.configured) {
        setConnectionStatus("Variáveis ausentes");
        return;
      }
      const client = getSupabaseClient();
      if (!client) {
        setConnectionStatus("Cliente indisponível");
        return;
      }
      const { error } = await client.from("profiles").select("id").limit(1);
      if (!cancelled) setConnectionStatus(error ? "Falhou" : "Conectado");
    }
    void checkConnection();
    return () => {
      cancelled = true;
    };
  }, [config.configured]);

  const items = [
    ["Provider ativo", getDataProvider()],
    ["Supabase URL", config.missing.url ? "Ausente" : "Configurada"],
    ["Supabase anon key", config.missing.anonKey ? "Ausente" : "Configurada"],
    ["Conexão Supabase", connectionStatus],
    ["Usuário atual", auth.user?.name ?? "Sem usuário"],
    ["Perfil atual", auth.user?.role ?? "Sem perfil"],
    ["Unidade atual", auth.user?.unit ?? "Sem unidade"],
    ["Simulações carregadas", String(simulationsCount)],
    ["Aprovações pendentes", String(pendingApprovalsCount)],
    ["Pedidos carregados", String(ordersCount)],
    ["Último erro", lastDataError ?? "Nenhum"],
  ];

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Diagnóstico técnico</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
