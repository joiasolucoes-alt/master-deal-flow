import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orders } from "@/data/orders";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/financeiro")({
  component: FinancialPage,
});

interface Receivable { id: string; client: string; document: string; dueDate: string; value: number; status: string; }

const receivables: Receivable[] = [
  { id: "r1", client: "Supermercado Central", document: "NF 588211", dueDate: "2026-06-25T00:00:00-03:00", value: 198750, status: "A vencer" },
  { id: "r2", client: "Mercado Bom Lar", document: "NF 587102", dueDate: "2026-06-19T00:00:00-03:00", value: 312450, status: "A vencer" },
  { id: "r3", client: "Atacado Vale Verde", document: "NF 550129", dueDate: "2026-07-26T00:00:00-03:00", value: 540300, status: "A vencer" },
  { id: "r4", client: "Distribuidora União", document: "NF 559871", dueDate: "2026-06-10T00:00:00-03:00", value: 89400, status: "Vencido" },
  { id: "r5", client: "Mercado São José", document: "NF 532109", dueDate: "2026-05-30T00:00:00-03:00", value: 156900, status: "Pago" },
];

const cashflow = [
  { month: "Jan", entradas: 1850000, saidas: 1100000 },
  { month: "Fev", entradas: 2030000, saidas: 1280000 },
  { month: "Mar", entradas: 2410000, saidas: 1380000 },
  { month: "Abr", entradas: 2700000, saidas: 1450000 },
  { month: "Mai", entradas: 3160000, saidas: 1620000 },
  { month: "Jun", entradas: 3580000, saidas: 1720000 },
];

function FinancialPage() {
  const totalReceive = receivables.filter((r) => r.status !== "Pago").reduce((sum, r) => sum + r.value, 0);
  const overdue = receivables.filter((r) => r.status === "Vencido").reduce((sum, r) => sum + r.value, 0);
  const paid = receivables.filter((r) => r.status === "Pago").reduce((sum, r) => sum + r.value, 0);
  const ordersValue = orders.reduce((sum, o) => sum + o.totalValue, 0);

  const columns: DataColumn<Receivable>[] = [
    { key: "doc", header: "Documento", cell: (r) => <span className="font-medium">{r.document}</span> },
    { key: "client", header: "Cliente", cell: (r) => r.client },
    { key: "due", header: "Vencimento", cell: (r) => formatDate(r.dueDate) },
    { key: "value", header: "Valor", className: "text-right", cell: (r) => <span className="font-medium">{formatCurrency(r.value)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status === "A vencer" ? "Em análise" : r.status === "Vencido" ? "Reprovada" : "Aprovada"} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" description="Fluxo de caixa, contas a receber e impactos financeiros das negociações." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Contas a receber" value={formatCurrency(totalReceive)} icon={Wallet} tone="info" />
        <StatCard label="Vencido" value={formatCurrency(overdue)} icon={ArrowDownCircle} tone="danger" />
        <StatCard label="Recebido no mês" value={formatCurrency(paid)} icon={Banknote} tone="success" />
        <StatCard label="Pedidos faturados" value={formatCurrency(ordersValue)} icon={CreditCard} tone="success" />
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Fluxo de caixa</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashflow}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" tickFormatter={(v) => formatCompactCurrency(v as number)} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: "var(--color-card)", borderRadius: 12, border: "1px solid var(--color-border)" }} />
              <Bar dataKey="entradas" radius={[8, 8, 0, 0]} fill="var(--color-primary)" />
              <Bar dataKey="saidas" radius={[8, 8, 0, 0]} fill="var(--color-chart-2)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Contas a receber</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="pending">A vencer</TabsTrigger>
              <TabsTrigger value="overdue">Vencidos</TabsTrigger>
              <TabsTrigger value="paid">Pagos</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="pt-4">
              <DataTable columns={columns} data={receivables} emptyTitle="Sem registros" emptyDescription="Não há contas para exibir." />
            </TabsContent>
            <TabsContent value="pending" className="pt-4">
              <DataTable columns={columns} data={receivables.filter((r) => r.status === "A vencer")} emptyTitle="Sem registros" emptyDescription="Não há contas a vencer." />
            </TabsContent>
            <TabsContent value="overdue" className="pt-4">
              <DataTable columns={columns} data={receivables.filter((r) => r.status === "Vencido")} emptyTitle="Sem vencidos" emptyDescription="Sem contas vencidas." />
            </TabsContent>
            <TabsContent value="paid" className="pt-4">
              <DataTable columns={columns} data={receivables.filter((r) => r.status === "Pago")} emptyTitle="Sem pagamentos" emptyDescription="Sem contas pagas." />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
