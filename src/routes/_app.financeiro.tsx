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
  createPayableTitlesFromOrder,
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
  const { auth, orders, financialTitles, freights, upsertFinancialTitle, upsertOrder } =
    useAppContext();
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleOrderIds = useMemo(
    () => new Set(visibleOrders.map((order) => order.id)),
    [visibleOrders],
  );
  const visibleTitles = useMemo(() => {
    return financialTitles
      .map((title) => ({ ...title, status: getFinancialTitleStatus(title) }))
      .filter((title) => {
        if (canViewAllFlows(auth.user)) return true;
        return visibleOrderIds.has(title.orderId ?? "") || belongsToUser(title.owner, auth.user);
      });
  }, [auth.user, financialTitles, visibleOrderIds]);
  const visibleReceivables = useMemo(
    () => visibleTitles.filter((title) => title.type === "receivable"),
    [visibleTitles],
  );
  const visiblePayables = useMemo(
    () => visibleTitles.filter((title) => title.type === "payable"),
    [visibleTitles],
  );
  const totalReceive = visibleReceivables
    .filter((r) => r.status !== "paid" && r.status !== "cancelled")
    .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0);
  const totalPayable = visiblePayables
    .filter((r) => r.status !== "paid" && r.status !== "cancelled")
    .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0);
  const overdue =
    visibleReceivables
      .filter((r) => r.status === "overdue")
      .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0) +
    visiblePayables
      .filter((r) => r.status === "overdue")
      .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0);
  const projectedBalance = totalReceive - totalPayable;
  const cashflow = useMemo(() => buildCashflow(visibleTitles), [visibleTitles]);
  const ordersWithoutReceivables = visibleOrders.filter(
    (order) =>
      !financialTitles.some((title) => title.orderId === order.id && title.type === "receivable"),
  );
  const ordersWithoutPayables = visibleOrders.filter(
    (order) =>
      !financialTitles.some((title) => title.orderId === order.id && title.type === "payable"),
  );

  const handleGenerateReceivables = () => {
    if (ordersWithoutReceivables.length === 0) {
      toast.info("Todos os pedidos visíveis já possuem contas a receber.");
      return;
    }

    ordersWithoutReceivables.forEach((order) => {
      createFinancialTitlesFromOrder(order).forEach(upsertFinancialTitle);
      if (order.status === "Aguardando faturamento") {
        upsertOrder({ ...order, status: "Em faturamento" });
      }
    });
    toast.success("Contas a receber geradas a partir dos pedidos.");
  };

  const handleGeneratePayables = () => {
    if (ordersWithoutPayables.length === 0) {
      toast.info("Todos os pedidos visíveis já possuem contas a pagar.");
      return;
    }

    let created = 0;
    ordersWithoutPayables.forEach((order) => {
      const titles = createPayableTitlesFromOrder(order, freights);
      titles.forEach((title) => {
        upsertFinancialTitle(title);
        created += 1;
      });
    });

    if (created === 0) {
      toast.info("Nenhuma conta a pagar foi encontrada nos pedidos visíveis.");
      return;
    }

    toast.success("Contas a pagar geradas a partir dos pedidos.");
  };

  const handleMarkAsPaid = (title: FinancialTitle) => {
    const paidTitle: FinancialTitle = {
      ...title,
      status: "paid",
      paidAmount: title.amount,
      paidAt: new Date().toISOString(),
    };
    upsertFinancialTitle(paidTitle);

    if (title.type === "receivable") {
      const relatedTitles = financialTitles
        .filter((item) => item.orderId === title.orderId && item.type === "receivable")
        .map((item) => (item.id === title.id ? paidTitle : item));
      const order = orders.find((item) => item.id === title.orderId);
      if (order && relatedTitles.length) {
        upsertOrder(updateOrderBilling(order, relatedTitles));
      }
    }

    toast.success(
      title.type === "payable" ? "Conta marcada como paga." : "Conta marcada como recebida.",
    );
  };

  const receivableColumns = buildFinancialColumns("Cliente", "Recebido", handleMarkAsPaid);
  const payableColumns = buildFinancialColumns("Favorecido", "Pago", handleMarkAsPaid);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa, contas a receber, contas a pagar e impactos financeiros das negociações."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Contas a receber"
          value={formatCurrency(totalReceive)}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          label="Contas a pagar"
          value={formatCurrency(totalPayable)}
          icon={CreditCard}
          tone="warning"
        />
        <StatCard
          label="Vencido"
          value={formatCurrency(overdue)}
          icon={ArrowDownCircle}
          tone="danger"
        />
        <StatCard
          label="Saldo projetado"
          value={formatCurrency(projectedBalance)}
          icon={Banknote}
          tone={projectedBalance >= 0 ? "success" : "danger"}
        />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Fluxo de caixa</CardTitle>
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
                radius={[8, 8, 0, 0]}
                fill="var(--color-primary)"
                animationDuration={800}
              />
              <Bar
                dataKey="saidas"
                name="Saídas"
                radius={[8, 8, 0, 0]}
                fill="var(--color-chart-2)"
                animationDuration={800}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Tabs defaultValue="receivable" className="space-y-4">
        <TabsList>
          <TabsTrigger value="receivable">Contas a receber</TabsTrigger>
          <TabsTrigger value="payable">Contas a pagar</TabsTrigger>
        </TabsList>

        <TabsContent value="receivable">
          <FinancialTitleCard
            title="Contas a receber"
            actionLabel="Gerar contas dos pedidos"
            onGenerate={handleGenerateReceivables}
            columns={receivableColumns}
            titles={visibleReceivables}
            emptyDescription="Não há contas a receber para exibir."
          />
        </TabsContent>

        <TabsContent value="payable">
          <FinancialTitleCard
            title="Contas a pagar"
            actionLabel="Gerar contas a pagar"
            onGenerate={handleGeneratePayables}
            columns={payableColumns}
            titles={visiblePayables}
            emptyDescription="Não há contas a pagar para exibir."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function buildFinancialColumns(
  partyLabel: string,
  paidLabel: string,
  onMarkAsPaid: (title: FinancialTitle) => void,
): DataColumn<FinancialTitle>[] {
  return [
    {
      key: "doc",
      header: "Documento",
      cell: (r) => <span className="font-medium">{r.titleNumber}</span>,
    },
    { key: "client", header: partyLabel, cell: (r) => r.client },
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
      header: paidLabel,
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
            onMarkAsPaid(r);
          }}
        >
          <CheckCircle2 />
          Dar baixa
        </Button>
      ),
    },
  ];
}

function FinancialTitleCard({
  title,
  actionLabel,
  onGenerate,
  columns,
  titles,
  emptyDescription,
}: {
  title: string;
  actionLabel: string;
  onGenerate: () => void;
  columns: DataColumn<FinancialTitle>[];
  titles: FinancialTitle[];
  emptyDescription: string;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <Button size="sm" variant="soft" onClick={onGenerate}>
          <Plus />
          {actionLabel}
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="pending">A vencer</TabsTrigger>
            <TabsTrigger value="overdue">Vencidos</TabsTrigger>
            <TabsTrigger value="paid">Pagos</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="pt-4">
            <DataTable
              columns={columns}
              data={titles}
              emptyTitle="Sem registros"
              emptyDescription={emptyDescription}
            />
          </TabsContent>
          <TabsContent value="pending" className="pt-4">
            <DataTable
              columns={columns}
              data={titles.filter((r) => r.status === "open" || r.status === "partial")}
              emptyTitle="Sem registros"
              emptyDescription="Não há contas a vencer."
            />
          </TabsContent>
          <TabsContent value="overdue" className="pt-4">
            <DataTable
              columns={columns}
              data={titles.filter((r) => r.status === "overdue")}
              emptyTitle="Sem vencidos"
              emptyDescription="Sem contas vencidas."
            />
          </TabsContent>
          <TabsContent value="paid" className="pt-4">
            <DataTable
              columns={columns}
              data={titles.filter((r) => r.status === "paid")}
              emptyTitle="Sem pagamentos"
              emptyDescription="Sem contas pagas."
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
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
    if (title.type === "payable") {
      current.saidas += title.status === "paid" ? title.paidAmount : title.amount;
    } else {
      current.entradas += title.status === "paid" ? title.paidAmount : title.amount;
    }
    byMonth.set(month, current);
  });

  return Array.from(byMonth.values()).slice(0, 6);
}
