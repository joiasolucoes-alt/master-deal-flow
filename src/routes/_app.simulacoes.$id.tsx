import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  Pencil,
  Plus,
  Send,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/app/page-header";
import { ProgressStepper } from "@/components/app/progress-stepper";
import { StatusBadge } from "@/components/app/status-badge";
import { ViabilityBadge } from "@/components/app/viability-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";
import { useAppContext } from "@/features/app/app-context";
import { clients } from "@/data/clients";
import { suppliers } from "@/data/suppliers";
import { products } from "@/data/products";
import { businessUnits, users } from "@/data/users";
import type { ExpenseItem, PurchaseItem, Simulation, SimulationProduct } from "@/data/types";
import {
  getExpenseTotal,
  getProductSaleTotal,
  getSimulationCostImpact,
  getSimulationSensitivity,
  getSimulationTotals,
} from "@/lib/calculations";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/simulacoes/$id")({
  component: SimulationDetailPage,
});

const STEPS = ["Cliente", "Produtos", "Compras", "Despesas", "Financeiro", "Resumo"];

function createEmptySimulation(): Simulation {
  const id = `sim-${Date.now()}`;
  return {
    id,
    number: `SIM-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 999)).padStart(4, "0")}`,
    client: clients[0].name,
    supplier: suppliers[0].name,
    deliveryCity: clients[0].city,
    deliveryState: clients[0].state,
    owner: users[0].name,
    unit: businessUnits[0],
    paymentCondition: "28 dias",
    deliveryDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString(),
    notes: "",
    status: "Rascunho",
    priority: "Média",
    products: [],
    purchaseItems: [],
    expenseItems: [],
    financial: { installmentDays: [14, 28], bank: "", paymentMethod: "Boleto bancário", account: "", discountPercent: 0, notes: "" },
  };
}

function SimulationDetailPage() {
  const { id } = useParams({ from: "/_app/simulacoes/$id" });
  const { simulations, upsertSimulation } = useAppContext();
  const initial = simulations.find((s) => s.id === id) ?? createEmptySimulation();
  const [draft, setDraft] = useState<Simulation>(initial);
  const [step, setStep] = useState(0);
  const totals = useMemo(() => getSimulationTotals(draft), [draft]);
  const costImpact = useMemo(() => getSimulationCostImpact(draft), [draft]);
  const sensitivity = useMemo(() => getSimulationSensitivity(draft), [draft]);

  function update<K extends keyof Simulation>(key: K, value: Simulation[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveDraft() {
    upsertSimulation(draft);
    toast.success("Simulação salva como rascunho");
  }

  function submitForApproval() {
    const next = { ...draft, status: "Em análise" as const };
    upsertSimulation(next);
    setDraft(next);
    toast.success("Simulação enviada para aprovação");
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/simulacoes"><ArrowLeft /> Voltar para simulações</Link>
      </Button>

      <PageHeader
        title={draft.number}
        description={`${draft.client} • ${draft.supplier} • ${draft.owner}`}
        action={
          <>
            <Button variant="outline"><Copy /> Duplicar</Button>
            <Button variant="outline"><Download /> Exportar</Button>
            <Button variant="outline" onClick={saveDraft}><Pencil /> Salvar rascunho</Button>
            <Button onClick={submitForApproval}><Send /> Enviar para aprovação</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={draft.status} />
        <ViabilityBadge viability={totals.viability} />
        <Badge variant="outline" className="rounded-full">Prioridade: {draft.priority}</Badge>
      </div>

      <ProgressStepper steps={STEPS} activeStep={step} onStepChange={setStep} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="shadow-card">
          <CardContent className="space-y-6 p-6">
            {step === 0 && <ClientStep draft={draft} update={update} />}
            {step === 1 && <ProductsStep draft={draft} setDraft={setDraft} />}
            {step === 2 && <PurchaseStep draft={draft} setDraft={setDraft} />}
            {step === 3 && <ExpensesStep draft={draft} setDraft={setDraft} />}
            {step === 4 && <FinancialStep draft={draft} setDraft={setDraft} />}
            {step === 5 && (
              <ResultStep
                draft={draft}
                totals={totals}
                costImpact={costImpact}
                sensitivity={sensitivity}
              />
            )}

            <div className="flex items-center justify-between border-t border-border pt-4">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Voltar</Button>
              <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>Próxima etapa</Button>
            </div>
          </CardContent>
        </Card>

        <SummarySidebar totals={totals} draft={draft} />
      </div>
    </div>
  );
}

function ClientStep({ draft, update }: { draft: Simulation; update: <K extends keyof Simulation>(key: K, value: Simulation[K]) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle title="Dados do cliente" description="Defina cliente, fornecedor e responsáveis pela operação." />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Cliente">
          <Select value={draft.client} onValueChange={(v) => update("client", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Fornecedor">
          <Select value={draft.supplier} onValueChange={(v) => update("supplier", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{suppliers.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Cidade de entrega">
          <Input value={draft.deliveryCity} onChange={(e) => update("deliveryCity", e.target.value)} />
        </Field>
        <Field label="UF">
          <Input value={draft.deliveryState} onChange={(e) => update("deliveryState", e.target.value)} />
        </Field>
        <Field label="Responsável">
          <Select value={draft.owner} onValueChange={(v) => update("owner", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Unidade">
          <Select value={draft.unit} onValueChange={(v) => update("unit", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{businessUnits.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Condição de pagamento">
          <Input value={draft.paymentCondition} onChange={(e) => update("paymentCondition", e.target.value)} />
        </Field>
        <Field label="Prioridade">
          <Select value={draft.priority} onValueChange={(v) => update("priority", v as Simulation["priority"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["Baixa", "Média", "Alta", "Crítica"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Data de entrega">
          <Input type="date" value={draft.deliveryDate.slice(0, 10)} onChange={(e) => update("deliveryDate", `${e.target.value}T12:00:00-03:00`)} />
        </Field>
        <Field label="Validade da proposta">
          <Input type="date" value={draft.validUntil.slice(0, 10)} onChange={(e) => update("validUntil", `${e.target.value}T12:00:00-03:00`)} />
        </Field>
      </div>
      <Field label="Observações comerciais">
        <Textarea rows={3} value={draft.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas, premissas e detalhes específicos da negociação..." />
      </Field>
    </div>
  );
}

function ProductsStep({ draft, setDraft }: { draft: Simulation; setDraft: React.Dispatch<React.SetStateAction<Simulation>> }) {
  function addProduct() {
    const base = products[0];
    const newProduct: SimulationProduct = {
      id: `sp-${Date.now()}`,
      code: base.code,
      product: base.name,
      boxes: 10,
      unitsPerBox: base.defaultUnitsPerBox,
      quantityTotal: 10 * base.defaultUnitsPerBox,
      costUnit: base.costUnit,
      saleUnit: base.saleUnit,
    };
    setDraft((d) => ({ ...d, products: [...d.products, newProduct] }));
  }

  function updateProduct(id: string, patch: Partial<SimulationProduct>) {
    setDraft((d) => ({
      ...d,
      products: d.products.map((p) => {
        if (p.id !== id) return p;
        const merged = { ...p, ...patch };
        merged.quantityTotal = merged.boxes * merged.unitsPerBox;
        return merged;
      }),
    }));
  }

  function removeProduct(id: string) {
    setDraft((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
  }

  return (
    <div className="space-y-4">
      <SectionTitle title="Produtos" description="Inclua os itens da operação com preços, quantidades e margem." />
      {draft.products.length === 0 ? (
        <EmptyState title="Nenhum produto adicionado" description="Adicione produtos para compor a simulação." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Caixas</TableHead>
                <TableHead className="text-right">Un/Cx</TableHead>
                <TableHead className="text-right">Qtd total</TableHead>
                <TableHead className="text-right">Custo un.</TableHead>
                <TableHead className="text-right">Venda un.</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Select value={p.code} onValueChange={(v) => {
                      const found = products.find((pr) => pr.code === v);
                      if (found) updateProduct(p.id, { code: found.code, product: found.name, costUnit: found.costUnit, saleUnit: found.saleUnit, unitsPerBox: found.defaultUnitsPerBox });
                    }}>
                      <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>{products.map((pr) => <SelectItem key={pr.id} value={pr.code}>{pr.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right"><Input type="number" min={0} value={p.boxes} onChange={(e) => updateProduct(p.id, { boxes: Number(e.target.value) })} className="ml-auto w-20 text-right" /></TableCell>
                  <TableCell className="text-right"><Input type="number" min={0} value={p.unitsPerBox} onChange={(e) => updateProduct(p.id, { unitsPerBox: Number(e.target.value) })} className="ml-auto w-20 text-right" /></TableCell>
                  <TableCell className="text-right">{new Intl.NumberFormat("pt-BR").format(p.quantityTotal)}</TableCell>
                  <TableCell className="text-right"><Input type="number" step="0.01" value={p.costUnit} onChange={(e) => updateProduct(p.id, { costUnit: Number(e.target.value) })} className="ml-auto w-24 text-right" /></TableCell>
                  <TableCell className="text-right"><Input type="number" step="0.01" value={p.saleUnit} onChange={(e) => updateProduct(p.id, { saleUnit: Number(e.target.value) })} className="ml-auto w-24 text-right" /></TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(getProductSaleTotal(p))}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => removeProduct(p.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Button variant="outline" onClick={addProduct}><Plus /> Adicionar produto</Button>
    </div>
  );
}

function PurchaseStep({ draft, setDraft }: { draft: Simulation; setDraft: React.Dispatch<React.SetStateAction<Simulation>> }) {
  function addItem() {
    const item: PurchaseItem = { id: `pi-${Date.now()}`, type: "Mercadoria", document: "", supplier: draft.supplier, value: 0, allocationPercent: 0 };
    setDraft((d) => ({ ...d, purchaseItems: [...d.purchaseItems, item] }));
  }
  function updateItem(id: string, patch: Partial<PurchaseItem>) {
    setDraft((d) => ({ ...d, purchaseItems: d.purchaseItems.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }
  function remove(id: string) {
    setDraft((d) => ({ ...d, purchaseItems: d.purchaseItems.filter((i) => i.id !== id) }));
  }

  return (
    <div className="space-y-4">
      <SectionTitle title="Itens de compra" description="Registre todos os documentos de compra que compõem o custo da operação." />
      {draft.purchaseItems.length === 0 ? (
        <EmptyState title="Sem itens de compra" description="Adicione documentos fiscais ou rateios de custo." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">% rateio</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.purchaseItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Select value={item.type} onValueChange={(v) => updateItem(item.id, { type: v as PurchaseItem["type"] })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Mercadoria", "Impostos", "Seguro", "Complemento", "Outros"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input value={item.document} onChange={(e) => updateItem(item.id, { document: e.target.value })} /></TableCell>
                  <TableCell><Input value={item.supplier} onChange={(e) => updateItem(item.id, { supplier: e.target.value })} /></TableCell>
                  <TableCell className="text-right"><Input type="number" step="0.01" value={item.value} onChange={(e) => updateItem(item.id, { value: Number(e.target.value) })} className="ml-auto w-32 text-right" /></TableCell>
                  <TableCell className="text-right"><Input type="number" step="0.1" value={item.allocationPercent} onChange={(e) => updateItem(item.id, { allocationPercent: Number(e.target.value) })} className="ml-auto w-24 text-right" /></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove(item.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Button variant="outline" onClick={addItem}><Plus /> Adicionar item</Button>
    </div>
  );
}

function ExpensesStep({ draft, setDraft }: { draft: Simulation; setDraft: React.Dispatch<React.SetStateAction<Simulation>> }) {
  function addItem() {
    const item: ExpenseItem = { id: `ex-${Date.now()}`, type: "Frete", calculationType: "fixed", value: 0 };
    setDraft((d) => ({ ...d, expenseItems: [...d.expenseItems, item] }));
  }
  function updateItem(id: string, patch: Partial<ExpenseItem>) {
    setDraft((d) => ({ ...d, expenseItems: d.expenseItems.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }
  function remove(id: string) {
    setDraft((d) => ({ ...d, expenseItems: d.expenseItems.filter((i) => i.id !== id) }));
  }

  return (
    <div className="space-y-4">
      <SectionTitle title="Despesas e custos operacionais" description="Aplique valores fixos ou percentuais sobre a receita simulada." />
      {draft.expenseItems.length === 0 ? (
        <EmptyState title="Sem despesas" description="Inclua frete, comissão, tributos e demais custos da operação." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Cálculo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.expenseItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Select value={item.type} onValueChange={(v) => updateItem(item.id, { type: v as ExpenseItem["type"] })}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Frete", "Comissão", "Custo fiscal", "Financeiro", "Tributos", "Pallets", "Chapa/Descarga", "Seguro", "Outros"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={item.calculationType} onValueChange={(v) => updateItem(item.id, { calculationType: v as ExpenseItem["calculationType"] })}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Valor fixo</SelectItem>
                        <SelectItem value="percentage">% da receita</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right"><Input type="number" step="0.01" value={item.value} onChange={(e) => updateItem(item.id, { value: Number(e.target.value) })} className="ml-auto w-32 text-right" /></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove(item.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Button variant="outline" onClick={addItem}><Plus /> Adicionar despesa</Button>
    </div>
  );
}

function FinancialStep({ draft, setDraft }: { draft: Simulation; setDraft: React.Dispatch<React.SetStateAction<Simulation>> }) {
  function update<K extends keyof Simulation["financial"]>(key: K, value: Simulation["financial"][K]) {
    setDraft((d) => ({ ...d, financial: { ...d.financial, [key]: value } }));
  }
  return (
    <div className="space-y-4">
      <SectionTitle title="Condições financeiras" description="Defina parcelas, banco e descontos aplicados." />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Prazos das parcelas (dias)">
          <Input value={draft.financial.installmentDays.join(", ")} onChange={(e) => update("installmentDays", e.target.value.split(",").map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v)))} />
        </Field>
        <Field label="Banco">
          <Input value={draft.financial.bank} onChange={(e) => update("bank", e.target.value)} />
        </Field>
        <Field label="Forma de pagamento">
          <Select value={draft.financial.paymentMethod} onValueChange={(v) => update("paymentMethod", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["Boleto bancário", "TED", "PIX corporativo", "Cartão BNDES"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Conta">
          <Input value={draft.financial.account} onChange={(e) => update("account", e.target.value)} />
        </Field>
        <Field label="Desconto financeiro (%)">
          <Input type="number" step="0.1" value={draft.financial.discountPercent} onChange={(e) => update("discountPercent", Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Notas financeiras">
        <Textarea rows={3} value={draft.financial.notes} onChange={(e) => update("notes", e.target.value)} />
      </Field>
    </div>
  );
}

function ResultStep({ draft, totals, costImpact, sensitivity }: {
  draft: Simulation;
  totals: ReturnType<typeof getSimulationTotals>;
  costImpact: ReturnType<typeof getSimulationCostImpact>;
  sensitivity: ReturnType<typeof getSimulationSensitivity>;
}) {
  return (
    <div className="space-y-6">
      <SectionTitle title="Resumo e viabilidade" description="Confira indicadores antes de enviar para aprovação." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Receita" value={formatCurrency(totals.revenue)} tone="info" />
        <SummaryTile label="Custos de compra" value={formatCurrency(totals.merchandiseCost)} tone="warning" />
        <SummaryTile label="Despesas" value={formatCurrency(totals.expenses)} tone="warning" />
        <SummaryTile label="Lucro líquido" value={formatCurrency(totals.netProfit)} tone={totals.netProfit > 0 ? "success" : "danger"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Composição das despesas</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={costImpact} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {costImpact.map((_, idx) => <Cell key={idx} fill={["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"][idx % 5]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: "var(--color-card)", borderRadius: 12, border: "1px solid var(--color-border)" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sensibilidade da margem</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sensitivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => formatPercent(Number(v))} contentStyle={{ background: "var(--color-card)", borderRadius: 12, border: "1px solid var(--color-border)" }} />
                <Bar dataKey="margin" radius={[8, 8, 0, 0]} fill="var(--color-primary)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Checklist do aprovador</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="products">Produtos</TabsTrigger>
              <TabsTrigger value="purchase">Compras</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-2 pt-4 text-sm">
              <p><strong>Cliente:</strong> {draft.client}</p>
              <p><strong>Fornecedor:</strong> {draft.supplier}</p>
              <p><strong>Condição:</strong> {draft.paymentCondition}</p>
              <p><strong>Margem:</strong> {formatPercent(totals.marginPercent)}</p>
            </TabsContent>
            <TabsContent value="products" className="pt-4">
              <ul className="space-y-1 text-sm">
                {draft.products.map((p) => <li key={p.id}>{p.product} — {p.quantityTotal} un. • {formatCurrency(p.saleUnit)}/un.</li>)}
              </ul>
            </TabsContent>
            <TabsContent value="purchase" className="pt-4">
              <ul className="space-y-1 text-sm">
                {draft.purchaseItems.map((p) => <li key={p.id}>{p.type} — {p.document} • {formatCurrency(p.value)}</li>)}
              </ul>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function SummarySidebar({ draft, totals }: { draft: Simulation; totals: ReturnType<typeof getSimulationTotals> }) {
  const expenseBreakdown = draft.expenseItems.map((item) => ({ name: item.type, value: getExpenseTotal(item, totals.revenue) }));
  return (
    <aside className="space-y-4">
      <Card className="shadow-card">
        <CardHeader><CardTitle>Resumo financeiro</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Receita" value={formatCurrency(totals.revenue)} />
          <Row label="Custo mercadoria" value={formatCurrency(totals.merchandiseCost)} />
          <Row label="Despesas" value={formatCurrency(totals.expenses)} />
          <Row label="Lucro bruto" value={formatCurrency(totals.grossProfit)} />
          <Row label="Lucro líquido" value={formatCurrency(totals.netProfit)} bold />
          <Row label="Margem" value={formatPercent(totals.marginPercent)} tone={totals.marginPercent >= 12 ? "success" : totals.marginPercent >= 8 ? "warning" : "danger"} bold />
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardHeader><CardTitle>Despesas por categoria</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {expenseBreakdown.length === 0 ? (
            <p className="text-muted-foreground">Sem despesas registradas.</p>
          ) : expenseBreakdown.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <span>{item.name}</span>
              <span className="font-medium">{formatCompactCurrency(item.value)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="border-primary/30 bg-primary-soft/50 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-primary"><TrendingUp className="h-4 w-4" /> Recomendação</CardTitle></CardHeader>
        <CardContent className="text-sm text-foreground">
          {totals.viability === "Viável" && "Margem dentro do alvo. Pronta para aprovação."}
          {totals.viability === "Atenção" && "Margem em zona de alerta. Avalie redução de custos."}
          {totals.viability === "Inviável" && "Reveja preços ou negocie custos antes de prosseguir."}
          {totals.viability === "Pendente" && "Adicione produtos para calcular a viabilidade."}
        </CardContent>
      </Card>
    </aside>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "success" | "warning" | "danger" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${toneCls}`}>{value}</span>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "info" }) {
  const cls = { success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info" }[tone];
  return (
    <div className={`rounded-2xl p-4 ${cls}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <CheckCircle2 className="mt-2 h-4 w-4 opacity-60" />
    </div>
  );
}
