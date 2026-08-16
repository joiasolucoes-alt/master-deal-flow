import { useCallback, useMemo, useState } from "react";
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
  CircleDashed,
  CircleDollarSign,
  Download,
  Eye,
  FileText,
  Landmark,
  Percent,
  ReceiptText,
  RotateCcw,
  Scale,
  Share2,
  Truck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { DetailDrawer } from "@/components/app/detail-drawer";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { getStatusColor } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
} from "@/lib/format";
import { downloadTextFile, notifyActionUnavailable } from "@/lib/actions";
import { useAppContext } from "@/features/app/app-context";
import { useAppStore } from "@/store/useAppStore";
import { getSimulationTotals } from "@/lib/calculations";
import {
  approveCommissionForRealizedResult,
  buildRealizedResults,
  createClosedRealizedResultRecord,
  getOperationClosureState,
  payCommissionForRealizedResult,
  reopenRealizedResultRecord,
  summarizeRealizedResults,
  type RealizedOrderResult,
  type RealizedFinancialEntry,
} from "@/features/results/realizedResult";
import {
  filterNegotiationsForUser,
  filterOrdersForUser,
  filterSimulationsForUser,
} from "@/lib/visibility";
import type { RealizedResultRecord } from "@/data/types";

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

function ReportsPage() {
  const [selectedResult, setSelectedResult] = useState<RealizedOrderResult | null>(null);
  const [commissionStageFilter, setCommissionStageFilter] =
    useState<CommissionStage>("awaiting_closing");
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
  const operationClosureSummary = useMemo(() => {
    const closed = realizedResults.filter(
      (result) =>
        getOperationClosureState(result, closedResultByOrderId.get(result.orderId)).isClosed,
    ).length;
    return { closed, pending: realizedResults.length - closed };
  }, [closedResultByOrderId, realizedResults]);
  const canCloseResults = auth.user?.role === "Admin" || auth.user?.role === "Financeiro";
  const commissionRows = useMemo<CommissionQueueRow[]>(
    () =>
      realizedResults
        .filter((result) => result.commissionTotal > 0)
        .map((result) => ({
          ...result,
          closedResult: closedResultByOrderId.get(result.orderId),
        })),
    [closedResultByOrderId, realizedResults],
  );
  const commissionStageCounts = useMemo(
    () =>
      commissionRows.reduce<Record<CommissionStage, number>>(
        (counts, row) => {
          counts[getCommissionStage(row)] += 1;
          return counts;
        },
        {
          awaiting_closing: 0,
          awaiting_approval: 0,
          ready_for_payment: 0,
          paid: 0,
        },
      ),
    [commissionRows],
  );
  const filteredCommissionRows = useMemo(
    () => commissionRows.filter((row) => getCommissionStage(row) === commissionStageFilter),
    [commissionRows, commissionStageFilter],
  );
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
      setCommissionStageFilter("awaiting_approval");
      toast.success(
        `Resultado do pedido ${result.orderNumber} fechado. Comissão enviada para aprovação.`,
      );
    },
    [auth.user?.name, canCloseResults, upsertRealizedResult],
  );
  const handleApproveCommission = useCallback(
    (result: RealizedOrderResult) => {
      if (!canCloseResults) {
        toast.error("Somente Admin ou Financeiro pode aprovar comissão.");
        return;
      }

      const closedResult = closedResultByOrderId.get(result.orderId);
      if (!closedResult || closedResult.status !== "closed") {
        toast.error("Feche o resultado antes de aprovar a comissão.");
        return;
      }

      if (closedResult.commissionApprovalStatus === "approved") return;

      upsertRealizedResult(approveCommissionForRealizedResult(closedResult, auth.user?.name));
      setCommissionStageFilter("ready_for_payment");
      toast.success(`Comissão do pedido ${result.orderNumber} liberada para pagamento.`);
    },
    [auth.user?.name, canCloseResults, closedResultByOrderId, upsertRealizedResult],
  );
  const handlePayCommission = useCallback(
    (row: CommissionQueueRow) => {
      if (!canCloseResults) {
        toast.error("Somente Admin ou Financeiro pode pagar comissão.");
        return;
      }

      const closedResult = row.closedResult;
      if (!closedResult || closedResult.status !== "closed") {
        toast.error("Feche o resultado antes de pagar a comissão.");
        return;
      }
      if (closedResult.commissionApprovalStatus !== "approved") {
        toast.error("A comissão precisa ser aprovada antes do pagamento.");
        return;
      }
      if (!closedResult.financialCompleted) {
        toast.error(
          "Pagamento de comissão bloqueado: financeiro do pedido ainda não foi concluído.",
        );
        return;
      }
      if (closedResult.commissionPaymentStatus === "paid") return;

      const notes = window.prompt("Observação do pagamento da comissão", "") ?? "";
      upsertRealizedResult(
        payCommissionForRealizedResult(closedResult, auth.user?.name, notes.trim()),
      );
      setCommissionStageFilter("paid");
      toast.success(`Comissão do pedido ${row.orderNumber} marcada como paga.`);
    },
    [auth.user?.name, canCloseResults, upsertRealizedResult],
  );
  const handleReopenResult = useCallback(
    (closedResult: RealizedResultRecord | undefined) => {
      if (!canCloseResults) {
        toast.error("Somente Admin ou Financeiro pode reabrir resultado.");
        return;
      }
      if (!closedResult || closedResult.status !== "closed") {
        toast.error("Resultado ainda não está fechado.");
        return;
      }
      if (closedResult.commissionPaymentStatus === "paid") {
        toast.error("Resultado com comissão já paga não pode ser reaberto nesta etapa.");
        return;
      }

      const reason = window.prompt("Motivo da reabertura do resultado", "");
      if (!reason?.trim()) {
        toast.error("Informe o motivo da reabertura.");
        return;
      }

      upsertRealizedResult(
        reopenRealizedResultRecord(closedResult, auth.user?.name, reason.trim()),
      );
      toast.success(`Resultado do pedido ${closedResult.orderNumber} reaberto.`);
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
        header: "Custos",
        className: "text-right",
        cell: (result) => formatCurrency(result.costPaidTotal),
      },
      {
        key: "freight",
        header: "Frete",
        className: "text-right",
        cell: (result) => (
          <div>
            <p className="font-semibold text-foreground">
              {formatCurrency(result.freightContractedTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(result.freightPaidTotal)} pago
            </p>
          </div>
        ),
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
        header: "Status",
        cell: (result) => {
          const closedResult = closedResultByOrderId.get(result.orderId);
          const closure = getOperationClosureState(result, closedResult);
          if (closure.isClosed) {
            return (
              <div className="space-y-1">
                <p className="font-semibold text-success">Operação encerrada</p>
                {closedResult?.commissionPaidAt ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(closedResult.commissionPaidAt)}
                  </p>
                ) : null}
              </div>
            );
          }

          return (
            <div className="space-y-1">
              <p className="font-semibold text-warning">Em encerramento</p>
              <p className="text-xs text-muted-foreground">
                Falta: {closure.missingSteps.join(", ")}
              </p>
            </div>
          );
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

          if (alreadyClosed) {
            return (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedResult(result)}>
                  <Eye />
                  Conferir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canCloseResults || closedResult?.commissionPaymentStatus === "paid"}
                  onClick={() => handleReopenResult(closedResult)}
                >
                  <RotateCcw />
                  Reabrir
                </Button>
                <span className="self-center text-xs text-muted-foreground">
                  Aprovação e pagamento na fila de comissões
                </span>
              </div>
            );
          }

          return (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedResult(result)}>
                <Eye />
                Conferir
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={!canCloseResults || !readyToClose}
                onClick={() => handleCloseResult(result)}
              >
                <CheckCircle2 />
                Fechar
              </Button>
            </div>
          );
        },
      },
    ],
    [canCloseResults, closedResultByOrderId, handleCloseResult, handleReopenResult],
  );
  const commissionColumns = useMemo<DataColumn<CommissionQueueRow>[]>(
    () => [
      {
        key: "order",
        header: "Pedido",
        cell: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.orderNumber}</p>
            <p className="text-xs text-muted-foreground">{row.client}</p>
          </div>
        ),
      },
      { key: "owner", header: "Comercial", cell: (row) => row.owner },
      {
        key: "commission",
        header: "Comissão",
        className: "text-right",
        cell: (row) => (
          <div>
            <p className="font-semibold text-foreground">{formatCurrency(row.commissionTotal)}</p>
            <p className="text-xs text-muted-foreground">
              {formatPercent(row.commissionPercent, 2)}
            </p>
          </div>
        ),
      },
      {
        key: "stage",
        header: "Status atual",
        cell: (row) => <CommissionStageStatus row={row} />,
      },
      {
        key: "actions",
        header: "Próxima ação",
        className: "text-right",
        cell: (row) => {
          const stage = getCommissionStage(row);
          const closed = row.closedResult;
          const readyToClose = row.deliveryCompleted && row.financialCompleted;

          return (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedResult(row)}>
                <Eye />
                Conferir
              </Button>
              {stage === "awaiting_closing" ? (
                <Button
                  size="sm"
                  disabled={!canCloseResults || !readyToClose}
                  onClick={() => handleCloseResult(row)}
                >
                  <CheckCircle2 />
                  Fechar resultado
                </Button>
              ) : null}
              {stage === "awaiting_approval" ? (
                <Button
                  size="sm"
                  disabled={!canCloseResults || !closed || closed.status !== "closed"}
                  onClick={() => handleApproveCommission(row)}
                >
                  <CheckCircle2 />
                  Aprovar comissão
                </Button>
              ) : null}
              {stage === "ready_for_payment" ? (
                <Button
                  size="sm"
                  disabled={!canCloseResults}
                  onClick={() => handlePayCommission(row)}
                >
                  <BadgeDollarSign />
                  Pagar comissão
                </Button>
              ) : null}
              {stage === "paid" ? (
                <Button size="sm" variant="outline" disabled>
                  <CheckCircle2 />
                  Comissão paga
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canCloseResults, handleApproveCommission, handleCloseResult, handlePayCommission],
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Receita recebida"
          value={formatCompactCurrency(realizedSummary.realizedRevenueTotal)}
          delta={`${realizedSummary.completedOrders} entregues e quitados`}
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
        <StatCard
          label="Operações encerradas"
          value={String(operationClosureSummary.closed)}
          delta={`${operationClosureSummary.pending} ainda em encerramento`}
          icon={CheckCircle2}
          tone={operationClosureSummary.pending > 0 ? "warning" : "success"}
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
                  {negotiationStatus.map((entry) => (
                    <Cell key={entry.name} fill={getStatusColor(entry.name)} />
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
          <CardTitle>Fila de comissões</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada pedido avança por uma etapa de cada vez: fechamento, aprovação e pagamento.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={commissionStageFilter}
            onValueChange={(value) => setCommissionStageFilter(value as CommissionStage)}
          >
            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-2 xl:grid-cols-4">
              {COMMISSION_STAGES.map((stage) => (
                <TabsTrigger
                  key={stage.value}
                  value={stage.value}
                  className="min-h-20 justify-start border border-border px-3 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary-soft data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block whitespace-normal text-sm font-semibold">
                        {stage.label}
                      </span>
                      <span className="mt-1 block whitespace-normal text-xs font-normal text-muted-foreground">
                        {stage.description}
                      </span>
                    </span>
                    <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-md bg-muted px-2 text-sm font-bold text-foreground">
                      {commissionStageCounts[stage.value]}
                    </span>
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DataTable
            columns={commissionColumns}
            data={filteredCommissionRows}
            emptyTitle={`Nenhuma comissão: ${getCommissionStageConfig(commissionStageFilter).label.toLowerCase()}`}
            emptyDescription={getCommissionStageEmptyDescription(commissionStageFilter)}
          />
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

      <RealizedResultDetail
        result={selectedResult}
        closedResult={
          selectedResult ? closedResultByOrderId.get(selectedResult.orderId) : undefined
        }
        onOpenChange={(open) => {
          if (!open) setSelectedResult(null);
        }}
      />
    </div>
  );
}

type CommissionQueueRow = RealizedOrderResult & {
  closedResult?: RealizedResultRecord;
};

type CommissionStage = "awaiting_closing" | "awaiting_approval" | "ready_for_payment" | "paid";

const COMMISSION_STAGES: Array<{
  value: CommissionStage;
  label: string;
  description: string;
}> = [
  {
    value: "awaiting_closing",
    label: "Aguardando fechamento",
    description: "Entrega e financeiro precisam estar concluídos.",
  },
  {
    value: "awaiting_approval",
    label: "Aguardando aprovação",
    description: "Resultado fechado, comissão pendente de análise.",
  },
  {
    value: "ready_for_payment",
    label: "Liberada para pagamento",
    description: "Comissão aprovada e pronta para pagar.",
  },
  {
    value: "paid",
    label: "Paga",
    description: "Comissões com pagamento concluído.",
  },
];

function RealizedResultDetail({
  result,
  closedResult,
  onOpenChange,
}: {
  result: RealizedOrderResult | null;
  closedResult?: RealizedResultRecord;
  onOpenChange: (open: boolean) => void;
}) {
  if (!result) {
    return (
      <DetailDrawer open={false} onOpenChange={onOpenChange} title="Conferência do resultado">
        <div />
      </DetailDrawer>
    );
  }

  const resultStatus =
    closedResult?.status === "closed" ? "Resultado fechado" : result.closingStatus;
  const operationClosure = getOperationClosureState(result, closedResult);

  return (
    <DetailDrawer
      open
      onOpenChange={onOpenChange}
      title={`Conferência ${result.orderNumber}`}
      description={`${result.client} • ${result.owner}`}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{resultStatus}</Badge>
          <Badge variant="secondary">{result.status}</Badge>
          <span className="text-xs text-muted-foreground">
            Unidade: {result.unit || "Não informada"}
          </span>
        </div>

        <OperationClosurePanel
          result={result}
          closedResult={closedResult}
          closure={operationClosure}
        />

        <section aria-labelledby="resultado-final-title" className="space-y-3">
          <div>
            <h3 id="resultado-final-title" className="font-semibold text-foreground">
              Resultado final
            </h3>
            <p className="text-sm text-muted-foreground">
              Visão consolidada dos valores registrados no Financeiro.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ResultMetric label="Valor recebido" value={result.realizedRevenueTotal} />
            <ResultMetric label="Custos pagos" value={result.costPaidTotal} />
            <ResultMetric label="Comissão" value={result.commissionTotal} />
            <ResultMetric
              label="Lucro realizado"
              value={result.realizedProfit}
              tone={result.realizedProfit >= 0 ? "success" : "danger"}
            />
          </div>
          <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-3">
            <ResultTextMetric
              label="Margem realizada"
              value={formatPercent(result.realizedMarginPercent, 2)}
              tone={result.realizedMarginPercent >= 0 ? "success" : "danger"}
            />
            <ResultTextMetric
              label="Margem prevista"
              value={formatPercent(result.predictedMarginPercent, 2)}
            />
            <ResultTextMetric
              label="Diferença"
              value={formatPercent(result.marginDeltaPercent, 2)}
              tone={result.marginDeltaPercent >= 0 ? "success" : "danger"}
            />
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Conta do lucro</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatCurrency(result.realizedRevenueTotal)} recebidos −{" "}
              {formatCurrency(result.costPaidTotal)} em custos pagos −{" "}
              {formatCurrency(result.commissionTotal)} de comissão ={" "}
              {formatCurrency(result.realizedProfit)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              O frete pago aparece dentro dos custos financeiros; o contratado também é mostrado
              separadamente abaixo para conferência.
            </p>
          </div>
        </section>

        <Separator />

        <FinancialCompositionSection
          id="recebimentos-title"
          title="Recebimentos"
          description={`${formatCurrency(result.realizedRevenueTotal)} recebido • ${formatCurrency(result.receivableOpenTotal)} em aberto`}
          icon={Landmark}
          entries={result.receivables}
          emptyText="Nenhum título a receber vinculado a este pedido."
        />

        <Separator />

        <FinancialCompositionSection
          id="contas-pagas-title"
          title="Contas pagas e a pagar"
          description={`${formatCurrency(result.costPaidTotal)} já pago • ${formatCurrency(Math.max(0, result.costBookedTotal - result.costPaidTotal))} em aberto`}
          icon={ReceiptText}
          entries={result.payables}
          emptyText="Nenhuma conta a pagar vinculada a este pedido."
        />

        <Separator />

        <section aria-labelledby="despesas-title" className="space-y-3">
          <SectionHeading
            id="despesas-title"
            icon={CircleDollarSign}
            title="Despesas da simulação"
            description="Valores previstos que deram origem à operação."
          />
          {result.expenses.length ? (
            <div className="divide-y divide-border border-y border-border">
              {result.expenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{expense.name}</p>
                    <p className="text-xs text-muted-foreground">{expense.calculation}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(expense.plannedAmount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem despesas da simulação para exibir.</p>
          )}
        </section>

        <Separator />

        <section aria-labelledby="frete-title" className="space-y-3">
          <SectionHeading
            id="frete-title"
            icon={Truck}
            title="Frete"
            description={`${formatCurrency(result.freightContractedTotal)} contratado • ${formatCurrency(result.freightPaidTotal)} pago`}
          />
          {result.freightDetails.length ? (
            <div className="divide-y divide-border border-y border-border">
              {result.freightDetails.map((freight) => (
                <div key={freight.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {freight.code} • {freight.carrier}
                      </p>
                      <p className="text-xs text-muted-foreground">{freight.route}</p>
                    </div>
                    <Badge variant="outline">{getFreightStatusLabel(freight.status)}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contratado / pago</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(freight.contractedAmount)} /{" "}
                      {formatCurrency(freight.paidAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum frete vinculado ao pedido.</p>
          )}
        </section>

        <Separator />

        <section aria-labelledby="comissao-title" className="space-y-3">
          <SectionHeading
            id="comissao-title"
            icon={BadgeDollarSign}
            title="Comissão"
            description={`${formatPercent(result.commissionPercent, 2)} sobre o valor recebido`}
          />
          <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-3">
            <ResultMetric label="Valor calculado" value={result.commissionTotal} />
            <ResultTextMetric label="Aprovação" value={getCommissionApprovalText(closedResult)} />
            <ResultTextMetric label="Pagamento" value={getCommissionPaymentText(closedResult)} />
          </div>
        </section>
      </div>
    </DetailDrawer>
  );
}

function OperationClosurePanel({
  result,
  closedResult,
  closure,
}: {
  result: RealizedOrderResult;
  closedResult?: RealizedResultRecord;
  closure: ReturnType<typeof getOperationClosureState>;
}) {
  const steps = [
    {
      label: "Entrega concluída",
      description: result.deliveryCompleted
        ? "Mercadoria entregue e comprovada."
        : "Aguardando a conclusão da entrega.",
      completed: result.deliveryCompleted,
    },
    {
      label: "Financeiro quitado",
      description: result.financialCompleted
        ? "Recebimentos e pagamentos concluídos."
        : "Ainda existem valores financeiros pendentes.",
      completed: result.financialCompleted,
    },
    {
      label: result.commissionTotal > 0 ? "Comissão paga" : "Sem comissão",
      description:
        result.commissionTotal <= 0
          ? "Este pedido não possui comissão prevista."
          : closedResult?.commissionPaymentStatus === "paid"
            ? `Pagamento concluído${closedResult.commissionPaidAt ? ` em ${formatDateTime(closedResult.commissionPaidAt)}` : ""}.`
            : getCommissionStageDetail({ ...result, closedResult }),
      completed: result.commissionTotal <= 0 || closedResult?.commissionPaymentStatus === "paid",
    },
  ];

  return (
    <section
      aria-labelledby="encerramento-operacao-title"
      className={`space-y-4 rounded-md border p-4 ${
        closure.isClosed ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="encerramento-operacao-title" className="font-semibold text-foreground">
            {closure.isClosed ? "Operação encerrada" : "Encerramento da operação"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {closure.isClosed
              ? "Entrega, financeiro e comissão estão concluídos."
              : `Falta concluir: ${closure.missingSteps.join(", ")}.`}
          </p>
        </div>
        <Badge variant={closure.isClosed ? "default" : "outline"}>
          {closure.completedSteps} de {closure.totalSteps} etapas
        </Badge>
      </div>
      <Progress value={closure.progress} aria-label={`Encerramento em ${closure.progress}%`} />
      <div className="grid gap-2 sm:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.completed ? CheckCircle2 : CircleDashed;
          return (
            <div
              key={step.label}
              className="flex items-start gap-2 rounded-md border border-border p-3"
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${step.completed ? "text-success" : "text-warning"}`}
              />
              <div>
                <p className="text-sm font-semibold text-foreground">{step.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ResultMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function ResultTextMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
}: {
  id: string;
  icon: typeof Landmark;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 id={id} className="font-semibold text-foreground">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FinancialCompositionSection({
  id,
  title,
  description,
  icon,
  entries,
  emptyText,
}: {
  id: string;
  title: string;
  description: string;
  icon: typeof Landmark;
  entries: RealizedFinancialEntry[];
  emptyText: string;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <SectionHeading id={id} icon={icon} title={title} description={description} />
      {entries.length ? (
        <div className="divide-y divide-border border-y border-border">
          {entries.map((entry) => (
            <div key={entry.id} className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {entry.titleNumber}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{entry.description}</p>
                </div>
                <Badge variant={entry.status === "paid" ? "secondary" : "outline"}>
                  {getFinancialStatusLabel(entry.status)}
                </Badge>
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <p className="text-muted-foreground">
                  Previsto:{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(entry.amount)}
                  </span>
                </p>
                <p className="text-muted-foreground sm:text-right">
                  Pago:{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(entry.paidAmount)}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Vencimento: <span className="text-foreground">{formatDate(entry.dueDate)}</span>
                </p>
                <p className="text-muted-foreground sm:text-right">
                  Saldo: <span className="text-foreground">{formatCurrency(entry.openAmount)}</span>
                </p>
              </div>
              {entry.bankName || entry.proofFileName ? (
                <p className="text-xs text-muted-foreground">
                  {[
                    entry.bankName ? `Banco: ${entry.bankName}` : "",
                    entry.proofFileName ? `Comprovante: ${entry.proofFileName}` : "",
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}

function getFinancialStatusLabel(status: RealizedFinancialEntry["status"]) {
  const labels: Record<RealizedFinancialEntry["status"], string> = {
    open: "Em aberto",
    partial: "Parcial",
    paid: "Pago",
    overdue: "Vencido",
    cancelled: "Cancelado",
  };
  return labels[status];
}

function getFreightStatusLabel(status: RealizedOrderResult["freightDetails"][number]["status"]) {
  const labels = {
    quoted: "Em contratação",
    hired: "Contratado",
    loading: "Em carregamento",
    in_route: "Em rota",
    at_destination: "No destino",
    delivery_refused: "Entrega recusada",
    returning: "Retorno em andamento",
    returned: "Mercadoria devolvida",
    unloaded: "Descarregado",
    delivered: "Entregue",
    cancelled: "Cancelado",
  } as const;
  return labels[status];
}

function getCommissionApprovalText(result?: RealizedResultRecord) {
  if (!result || result.status !== "closed") return "Aguardando fechamento";
  if (result.commissionApprovalStatus === "approved") return "Aprovada";
  if (result.commissionApprovalStatus === "rejected") return "Reprovada";
  return "Pendente";
}

function getCommissionPaymentText(result?: RealizedResultRecord) {
  if (!result || result.status !== "closed") return "Bloqueado";
  if (result.commissionPaymentStatus === "paid") return "Paga";
  if (result.commissionPaymentStatus === "blocked") return "Bloqueado";
  return "Pendente";
}

function getCommissionStage(row: CommissionQueueRow): CommissionStage {
  const closed = row.closedResult;
  if (closed?.commissionPaymentStatus === "paid") return "paid";
  if (!closed || closed.status !== "closed") return "awaiting_closing";
  if (closed.commissionApprovalStatus !== "approved") return "awaiting_approval";
  return "ready_for_payment";
}

function getCommissionStageConfig(stage: CommissionStage) {
  return COMMISSION_STAGES.find((item) => item.value === stage) ?? COMMISSION_STAGES[0];
}

function getCommissionStageEmptyDescription(stage: CommissionStage) {
  const descriptions: Record<CommissionStage, string> = {
    awaiting_closing: "Nenhum pedido com comissão aguarda o fechamento do resultado.",
    awaiting_approval: "Nenhuma comissão aguarda aprovação neste momento.",
    ready_for_payment: "Nenhuma comissão está liberada para pagamento.",
    paid: "Nenhuma comissão foi marcada como paga.",
  };
  return descriptions[stage];
}

function CommissionStageStatus({ row }: { row: CommissionQueueRow }) {
  const stage = getCommissionStage(row);
  const config = getCommissionStageConfig(stage);
  const closed = row.closedResult;
  const toneClass =
    stage === "paid"
      ? "text-success"
      : stage === "ready_for_payment"
        ? "text-info"
        : stage === "awaiting_approval"
          ? "text-warning"
          : "text-foreground";

  return (
    <div className="max-w-xs space-y-1">
      <p className={`font-semibold ${toneClass}`}>{config.label}</p>
      <p className="text-xs text-muted-foreground">{getCommissionStageDetail(row)}</p>
      {stage === "paid" && closed?.commissionPaidAt ? (
        <p className="text-xs text-muted-foreground">
          {formatDateTime(closed.commissionPaidAt)}
          {closed.commissionPaidBy ? ` • ${closed.commissionPaidBy}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function getCommissionStageDetail(row: CommissionQueueRow) {
  const stage = getCommissionStage(row);
  const closed = row.closedResult;

  if (stage === "paid") return "Pagamento da comissão concluído.";
  if (stage === "ready_for_payment") {
    return closed?.commissionApprovedBy
      ? `Aprovada por ${closed.commissionApprovedBy}.`
      : "Aprovação concluída.";
  }
  if (stage === "awaiting_approval") {
    if (closed?.commissionApprovalStatus === "rejected") {
      return "Comissão reprovada e aguardando nova análise.";
    }
    return closed?.closedAt
      ? `Resultado fechado em ${formatDateTime(closed.closedAt)}.`
      : "Resultado fechado e pronto para análise.";
  }
  if (closed?.status === "in_progress") {
    return closed.reopenReason
      ? `Resultado reaberto: ${closed.reopenReason}`
      : "Resultado reaberto para revisão.";
  }
  if (!row.deliveryCompleted && !row.financialCompleted) {
    return "Aguardando entrega e quitação financeira.";
  }
  if (!row.deliveryCompleted) return "Aguardando a entrega do pedido.";
  if (!row.financialCompleted) return "Aguardando a quitação financeira.";
  return "Pronto para fechar o resultado.";
}
