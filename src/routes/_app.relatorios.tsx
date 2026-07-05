import { useCallback, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeDollarSign,
  CheckCircle2,
  Download,
  FileText,
  Percent,
  Scale,
  Share2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency, formatDateTime, formatPercent } from "@/lib/format";
import { downloadTextFile, notifyActionUnavailable } from "@/lib/actions";
import { useAppContext } from "@/features/app/app-context";
import { useAppStore } from "@/store/useAppStore";
import { getSimulationTotals } from "@/lib/calculations";
import {
  buildRealizedResults,
  createClosedRealizedResultRecord,
  summarizeRealizedResults,
  type RealizedOrderResult,
} from "@/features/results/realizedResult";
import {
  filterNegotiationsForUser,
  filterOrdersForUser,
  filterSimulationsForUser,
} from "@/lib/visibility";

export const Route = createFileRoute("/_app/relatorios")({
  component: ReportsPage,
});

const reports = [
  {
    title: "Resultado por unidade",
    description: "Comparativo de margem e volume entre Matriz e filiais.",
    tag: "Comercial",
  },
  {
    title: "Funil de aprovações",
    description: "Tempo médio em cada etapa do fluxo de aprovação.",
    tag: "Operacional",
  },
  {
    title: "Performance por responsável",
    description: "Conversão de simulações em pedidos por comercial.",
    tag: "Pessoas",
  },
  {
    title: "Mix de produtos",
    description: "Participação de cada SKU nas negociações fechadas.",
    tag: "Produtos",
  },
];

const pieColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function ReportsPage() {
  const {
    auth,
    simulations,
    orders,
    financialTitles,
    realizedResults: closedRealizedResults,
    freights,
    deliveries,
    upsertRealizedResult,
  } = useAppContext();
  const negotiations = useAppStore((store) => store.negotiations);
  const visibleSimulations = useMemo(
    () => filterSimulationsForUser(simulations, auth.user),
    [auth.user, simulations],
  );
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleNegotiations = useMemo(
    () => filterNegotiationsForUser(negotiations, auth.user),
    [auth.user, negotiations],
  );
  const simulationEvolution = Object.entries(
    visibleSimulations.reduce<Record<string, number>>((acc, simulation) => {
      const day = new Date(simulation.createdAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      acc[day] = (acc[day] ?? 0) + getSimulationTotals(simulation).revenue;
      return acc;
    }, {}),
  ).map(([day, value]) => ({ day, value }));
  const negotiationStatus = Object.entries(
    visibleNegotiations.reduce<Record<string, number>>((acc, negotiation) => {
      acc[negotiation.status] = (acc[negotiation.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));
  const topClients = Object.entries(
    [...visibleSimulations, ...visibleOrders].reduce<Record<string, number>>((acc, item) => {
      const value = "totalValue" in item ? item.totalValue : getSimulationTotals(item).revenue;
      acc[item.client] = (acc[item.client] ?? 0) + value;
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const visibleOrderIds = useMemo(
    () => new Set(visibleOrders.map((order) => order.id)),
    [visibleOrders],
  );
  const realizedResults = useMemo(
    () =>
      buildRealizedResults({
        orders: visibleOrders,
        simulations: visibleSimulations,
        financialTitles: financialTitles.filter((title) =>
          title.orderId ? visibleOrderIds.has(title.orderId) : false,
        ),
        freights: freights.filter((freight) =>
          freight.orderId ? visibleOrderIds.has(freight.orderId) : false,
        ),
        deliveries: deliveries.filter((delivery) =>
          delivery.orderId ? visibleOrderIds.has(delivery.orderId) : false,
        ),
      }),
    [deliveries, financialTitles, freights, visibleOrderIds, visibleOrders, visibleSimulations],
  );
  const realizedSummary = useMemo(
    () => summarizeRealizedResults(realizedResults),
    [realizedResults],
  );
  const closedResultByOrderId = useMemo(
    () => new Map(closedRealizedResults.map((result) => [result.orderId, result])),
    [closedRealizedResults],
  );
  const canCloseResults = auth.user?.role === "Admin" || auth.user?.role === "Financeiro";
  const handleCloseResult = useCallback(
    (result: RealizedOrderResult) => {
      if (!canCloseResults) {
        toast.error("Somente Admin ou Financeiro pode fechar resultado.");
        return;
      }

      if (!result.deliveryCompleted || !result.financialCompleted) {
        toast.error("Para fechar, o pedido precisa estar entregue e financeiro quitado.");
        return;
      }

      upsertRealizedResult(createClosedRealizedResultRecord(result, auth.user?.name));
      toast.success(`Resultado do pedido ${result.orderNumber} fechado.`);
    },
    [auth.user?.name, canCloseResults, upsertRealizedResult],
  );
  const realizedColumns = useMemo<DataColumn<RealizedOrderResult>[]>(
    () => [
      {
        key: "order",
        header: "Pedido",
        cell: (result) => (
          <div>
            <p className="font-semibold text-foreground">{result.orderNumber}</p>
            <p className="text-xs text-muted-foreground">{result.client}</p>
          </div>
        ),
      },
      {
        key: "realizedRevenueTotal",
        header: "Recebido",
        className: "text-right",
        cell: (result) => formatCurrency(result.realizedRevenueTotal),
      },
      {
        key: "costPaidTotal",
        header: "Custos pagos",
        className: "text-right",
        cell: (result) => formatCurrency(result.costPaidTotal),
      },
      {
        key: "commissionTotal",
        header: "Comissão",
        className: "text-right",
        cell: (result) => formatCurrency(result.commissionTotal),
      },
      {
        key: "realizedProfit",
        header: "Lucro realizado",
        className: "text-right",
        cell: (result) => (
          <span className={result.realizedProfit >= 0 ? "text-success" : "text-danger"}>
            {formatCurrency(result.realizedProfit)}
          </span>
        ),
      },
      {
        key: "margin",
        header: "Margem real",
        className: "text-right",
        cell: (result) => (
          <div>
            <p className="font-semibold text-foreground">
              {formatPercent(result.realizedMarginPercent, 2)}
            </p>
            <p
              className={
                result.marginDeltaPercent >= 0 ? "text-xs text-success" : "text-xs text-danger"
              }
            >
              {formatPercent(result.marginDeltaPercent, 2)} vs previsto
            </p>
          </div>
        ),
      },
      {
        key: "status",
        header: "Fechamento",
        cell: (result) => {
          const closedResult = closedResultByOrderId.get(result.orderId);
          if (closedResult?.status === "closed") {
            return (
              <div className="space-y-1">
                <p className="font-semibold text-success">Fechado</p>
                {closedResult.closedAt ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(closedResult.closedAt)}
                  </p>
                ) : null}
              </div>
            );
          }

          return result.closingStatus;
        },
      },
      {
        key: "actions",
        header: "",
        className: "text-right",
        cell: (result) => {
          const closedResult = closedResultByOrderId.get(result.orderId);
          const alreadyClosed = closedResult?.status === "closed";
          const readyToClose = result.deliveryCompleted && result.financialCompleted;

          return (
            <Button
              variant={alreadyClosed ? "outline" : "default"}
              size="sm"
              disabled={alreadyClosed || !canCloseResults || !readyToClose}
              onClick={() => handleCloseResult(result)}
            >
              <CheckCircle2 />
              {alreadyClosed ? "Fechado" : "Fechar"}
            </Button>
          );
        },
      },
    ],
    [canCloseResults, closedResultByOrderId, handleCloseResult],
  );

  function exportReports() {
    downloadTextFile(
      "relatorios-master-flow.txt",
      reports.map((report) => `${report.title} — ${report.description}`).join("\n"),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Indicadores consolidados e relatórios exportáveis para análise da operação."
        action={
          <>
            <Button
              variant="outline"
              onClick={() => notifyActionUnavailable("Compartilhar relatórios")}
            >
              <Share2 /> Compartilhar
            </Button>
            <Button onClick={exportReports}>
              <Download /> Exportar tudo
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Receita recebida"
          value={formatCompactCurrency(realizedSummary.realizedRevenueTotal)}
          delta={`${realizedSummary.completedOrders} pedidos concluídos`}
          icon={WalletCards}
          tone="info"
        />
        <StatCard
          label="Lucro realizado"
          value={formatCompactCurrency(realizedSummary.realizedProfit)}
          delta={formatCurrency(realizedSummary.commissionTotal) + " em comissão"}
          icon={BadgeDollarSign}
          tone={realizedSummary.realizedProfit >= 0 ? "success" : "danger"}
        />
        <StatCard
          label="Margem realizada"
          value={formatPercent(realizedSummary.averageRealizedMarginPercent, 2)}
          delta={`${formatPercent(realizedSummary.averagePredictedMarginPercent, 2)} previsto`}
          icon={Percent}
          tone="success"
        />
        <StatCard
          label="Saldo a receber"
          value={formatCompactCurrency(realizedSummary.receivableOpenTotal)}
          delta={formatCompactCurrency(realizedSummary.costPaidTotal) + " custos pagos"}
          icon={Scale}
          tone={realizedSummary.receivableOpenTotal > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Volume simulado x mês</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={simulationEvolution}
                margin={{ left: 8, right: 12, top: 12, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
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
                  width={64}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  contentStyle={{
                    background: "var(--color-card)",
                    color: "var(--color-card-foreground)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    boxShadow: "var(--shadow-elevated)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
                  activeDot={{ r: 6 }}
                  animationDuration={900}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Distribuição de status</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={negotiationStatus}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {negotiationStatus.map((_, idx) => (
                    <Cell key={idx} fill={pieColors[idx % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle>Top clientes</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topClients}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 8, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => formatCompactCurrency(v as number)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  width={180}
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
                <Bar
                  dataKey="value"
                  radius={[0, 8, 8, 0]}
                  fill="var(--color-primary)"
                  animationDuration={900}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Relatórios disponíveis</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {reports.map((report) => (
            <div
              key={report.title}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-border p-4"
            >
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="truncate font-semibold text-foreground">{report.title}</p>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => notifyActionUnavailable(`Abrir relatório: ${report.title}`)}
              >
                Abrir
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Resultado realizado por pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={realizedColumns}
            data={realizedResults}
            emptyTitle="Nenhum resultado realizado"
            emptyDescription="Pedidos com movimentação financeira aparecerão aqui para comparação entre previsto e realizado."
          />
        </CardContent>
      </Card>
    </div>
  );
}
