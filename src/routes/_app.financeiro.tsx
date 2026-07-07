import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownCircle, Banknote, CheckCircle2, CreditCard, Plus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppContext } from "@/features/app/app-context";
import type { FinancialTitle, Order } from "@/data/types";
import {
  calculateBillingProgress,
  createFinancialTitlesFromOrder,
  getFinancialTitleStatus,
  getStatusLabel,
} from "@/features/finance/financialTitleHelpers";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import { belongsToUser, canViewAllFlows, filterOrdersForUser } from "@/lib/visibility";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/financeiro")({
  component: FinancialPage,
});

function FinancialPage() {
  const { auth, orders, financialTitles, upsertFinancialTitle, upsertOrder } = useAppContext();
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleOrderIds = useMemo(
    () => new Set(visibleOrders.map((order) => order.id)),
    [visibleOrders],
  );
  const visibleReceivables = useMemo(() => {
    return financialTitles
      .filter((title) => title.type === "receivable")
      .map((title) => ({ ...title, status: getFinancialTitleStatus(title) }))
      .filter((title) => {
        if (canViewAllFlows(auth.user)) return true;
        return visibleOrderIds.has(title.orderId ?? "") || belongsToUser(title.owner, auth.user);
      });
  }, [auth.user, financialTitles, visibleOrderIds]);
  const totalReceive = visibleReceivables
    .filter((r) => r.status !== "paid" && r.status !== "cancelled")
    .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0);
  const overdue = visibleReceivables
    .filter((r) => r.status === "overdue")
    .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0);
  const paid = visibleReceivables
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.paidAmount, 0);
  const ordersValue = visibleOrders.reduce((sum, o) => sum + o.totalValue, 0);
  const cashflow = useMemo(() => buildCashflow(visibleReceivables), [visibleReceivables]);
  const ordersWithoutTitles = visibleOrders.filter(
    (order) => !financialTitles.some((title) => title.orderId === order.id),
  );

  const handleGenerateReceivables = () => {
    if (ordersWithoutTitles.length === 0) {
      toast.info("Todos os pedidos visíveis já possuem contas financeiras.");
      return;
    }

    ordersWithoutTitles.forEach((order) => {
      createFinancialTitlesFromOrder(order).forEach(upsertFinancialTitle);
      if (order.status === "Aguardando faturamento") {
        upsertOrder({ ...order, status: "Em faturamento" });
      }
    });
    toast.success("Contas financeiras geradas a partir dos pedidos.");
  };

  const handleMarkAsPaid = (title: FinancialTitle) => {
    const paidTitle: FinancialTitle = {
      ...title,
      status: "paid",
      paidAmount: title.amount,
      paidAt: new Date().toISOString(),
    };
    upsertFinancialTitle(paidTitle);

    const relatedTitles = financialTitles
      .filter((item) => item.orderId === title.orderId)
      .map((item) => (item.id === title.id ? paidTitle : item));
    const order = orders.find((item) => item.id === title.orderId);
    if (order && relatedTitles.length) {
      upsertOrder(updateOrderBilling(order, relatedTitles));
    }

    toast.success("Conta marcada como recebida.");
  };

  const columns: DataColumn<FinancialTitle>[] = [
    {
      key: "doc",
      header: "Documento",
      cell: (r) => <span className="font-medium">{r.titleNumber}</span>,
    },
    { key: "client", header: "Cliente", cell: (r) => r.client },
    { key: "order", header: "Pedido", cell: (r) => r.orderNumber ?? "-" },
    { key: "due", header: "Vencimento", cell: (r) => formatDate(r.dueDate) },
    {
      key: "value",
      header: "Valor",
      className: "text-right",
      cell: (r) => <span className="font-medium">{formatCurrency(r.amount)}</span>,
    },
    {
      key: "paid",
      header: "Recebido",
      className: "text-right",
      cell: (r) => formatCurrency(r.paidAmount),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={getStatusLabel(r.status)} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          disabled={r.status === "paid" || r.status === "cancelled"}
          onClick={(event) => {
            event.stopPropagation();
            handleMarkAsPaid(r);
          }}
        >
          <CheckCircle2 />
          Dar baixa
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa, contas a receber e impactos financeiros das negociações."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Contas a receber"
          value={formatCurrency(totalReceive)}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          label="Vencido"
          value={formatCurrency(overdue)}
          icon={ArrowDownCircle}
          tone="danger"
        />
        <StatCard
          label="Recebido no mês"
          value={formatCurrency(paid)}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label="Pedidos faturados"
          value={formatCurrency(ordersValue)}
          icon={CreditCard}
          tone="success"
        />
      </div>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Fluxo de caixa</CardTitle>
          <p className="text-sm text-muted-foreground">
            Comparativo mensal entre entradas previstas e saídas operacionais.
          </p>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashflow} margin={{ left: 8, right: 12, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="var(--color-muted-foreground)"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                stroke="var(--color-muted-foreground)"
                tickFormatter={(v) => formatCompactCurrency(v as number)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                width={72}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in oklab, var(--color-primary) 8%, transparent)" }}
                formatter={(v) => formatCurrency(Number(v))}
                contentStyle={{
                  background: "var(--color-card)",
                  color: "var(--color-card-foreground)",
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-elevated)",
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{
                  fontSize: 12,
                  color: "var(--color-muted-foreground)",
                  paddingTop: 8,
                }}
              />
              <Bar
                dataKey="entradas"
                name="Entradas"
                radius={[3, 3, 0, 0]}
                fill="var(--color-success)"
                animationDuration={500}
              />
              <Bar
                dataKey="saidas"
                name="Saídas"
                radius={[3, 3, 0, 0]}
                fill="var(--color-chart-2)"
                animationDuration={500}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border">
          <div>
            <CardTitle>Contas a receber</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe vencimentos, baixas e valores em aberto.
            </p>
          </div>
          <Button size="sm" variant="soft" onClick={handleGenerateReceivables}>
            <Plus />
            Gerar contas dos pedidos
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="all">
            <TabsList className="px-5">
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="pending">A vencer</TabsTrigger>
              <TabsTrigger value="overdue">Vencidos</TabsTrigger>
              <TabsTrigger value="paid">Pagos</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-0">
              <DataTable
                columns={columns}
                data={visibleReceivables}
                emptyTitle="Sem registros"
                emptyDescription="Não há contas para exibir."
                className="rounded-none border-x-0 border-b-0 shadow-none"
              />
            </TabsContent>
            <TabsContent value="pending" className="mt-0">
              <DataTable
                columns={columns}
                data={visibleReceivables.filter(
                  (r) => r.status === "open" || r.status === "partial",
                )}
                emptyTitle="Sem registros"
                emptyDescription="Não há contas a vencer."
                className="rounded-none border-x-0 border-b-0 shadow-none"
              />
            </TabsContent>
            <TabsContent value="overdue" className="mt-0">
              <DataTable
                columns={columns}
                data={visibleReceivables.filter((r) => r.status === "overdue")}
                emptyTitle="Sem vencidos"
                emptyDescription="Sem contas vencidas."
                className="rounded-none border-x-0 border-b-0 shadow-none"
              />
            </TabsContent>
            <TabsContent value="paid" className="mt-0">
              <DataTable
                columns={columns}
                data={visibleReceivables.filter((r) => r.status === "paid")}
                emptyTitle="Sem pagamentos"
                emptyDescription="Sem contas pagas."
                className="rounded-none border-x-0 border-b-0 shadow-none"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function updateOrderBilling(order: Order, titles: FinancialTitle[]): Order {
  const billingProgress = calculateBillingProgress(titles);
  const status =
    billingProgress >= 100 &&
    (order.status === "Aguardando faturamento" || order.status === "Em faturamento")
      ? "Em separação"
      : billingProgress > 0 && order.status === "Aguardando faturamento"
        ? "Em faturamento"
        : order.status;

  return {
    ...order,
    billingProgress,
    status,
  };
}

function buildCashflow(titles: FinancialTitle[]) {
  const byMonth = new Map<string, { month: string; entradas: number; saidas: number }>();
  titles.forEach((title) => {
    const date = new Date(title.dueDate);
    const month = Number.isNaN(date.getTime())
      ? "Sem data"
      : new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
    const current = byMonth.get(month) ?? { month, entradas: 0, saidas: 0 };
    current.entradas += title.status === "paid" ? title.paidAmount : title.amount;
    byMonth.set(month, current);
  });

  return Array.from(byMonth.values()).slice(0, 6);
}
