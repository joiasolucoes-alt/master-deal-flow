import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
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
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Handshake,
  PiggyBank,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { simulationEvolution } from "@/data/dashboard";
import { formatCompactCurrency, formatCurrency, formatDateTime, formatPercent } from "@/lib/format";
import { getSimulationTotals } from "@/lib/calculations";
import { downloadTextFile } from "@/lib/actions";
import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import { useAppContext } from "@/features/app/app-context";
import { canCreateSimulation } from "@/lib/permissions";
import { useAppStore } from "@/store/useAppStore";
import {
  filterNegotiationsForUser,
  filterOrdersForUser,
  filterSimulationsForUser,
} from "@/lib/visibility";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

const kpiIcons = [
  Handshake,
  ClipboardCheck,
  CheckCircle2,
  TriangleAlert,
  PiggyBank,
  ArrowUpRight,
  ArrowUpRight,
];
const pieColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function DashboardPage() {
  const { auth, simulations, orders } = useAppContext();
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
  const pendingApprovals = visibleSimulations.filter(
    (simulation) =>
      simulation.status === "Pendente de aprovação" || simulation.status === "Em análise",
  ).length;
  const revenue = visibleSimulations.reduce(
    (sum, simulation) => sum + getSimulationTotals(simulation).revenue,
    0,
  );
  const averageMargin =
    visibleSimulations.length > 0
      ? visibleSimulations.reduce(
          (sum, simulation) => sum + getSimulationTotals(simulation).marginPercent,
          0,
        ) / visibleSimulations.length
      : 0;
  const dashboardCards = [
    {
      label: "Negociações",
      value: String(visibleNegotiations.length),
      delta: "0,0%",
      tone: "info",
    },
    { label: "Simulações", value: String(visibleSimulations.length), delta: "0,0%", tone: "info" },
    {
      label: "Aprovações pendentes",
      value: String(pendingApprovals),
      delta: "0,0%",
      tone: "warning",
    },
    {
      label: "Pedidos ativos",
      value: String(visibleOrders.filter((order) => order.status !== "Entregue").length),
      delta: "0,0%",
      tone: "success",
    },
    {
      label: "Receita simulada",
      value: formatCompactCurrency(revenue),
      delta: "0,0%",
      tone: "success",
    },
    {
      label: "Margem média",
      value: formatPercent(averageMargin, 1),
      delta: "0,0%",
      tone:
        averageMargin >= MINIMUM_MARGIN_TARGET
          ? "success"
          : averageMargin >= ATTENTION_MARGIN_TARGET
            ? "warning"
            : "danger",
    },
    {
      label: "Pedidos entregues",
      value: String(visibleOrders.filter((order) => order.status === "Entregue").length),
      delta: "0,0%",
      tone: "info",
    },
  ];
  const statusData = Object.entries(
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

  function exportDashboardReport() {
    downloadTextFile(
      "dashboard-master-flow.txt",
      `Relatório Dashboard\nGerado em: ${new Date().toLocaleString("pt-BR")}\nSimulações visíveis: ${visibleSimulations.length}\nPedidos visíveis: ${visibleOrders.length}`,
    );
  }

  const recentSimulations = visibleSimulations.slice(0, 4);
  const recentOrders = visibleOrders.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description="Acompanhe o desempenho comercial, simulações e pedidos em tempo real."
        action={
          <>
            <Button variant="outline" onClick={exportDashboardReport}>
              Exportar relatório
            </Button>
            {canCreateSimulation(auth.user) ? (
              <Button asChild>
                <Link to="/simulacoes">
                  <Plus /> Nova simulação
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardCards.slice(0, 4).map((kpi, idx) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            icon={kpiIcons[idx] ?? Handshake}
            tone={kpi.tone as "success" | "warning" | "danger" | "info"}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {dashboardCards.slice(4).map((kpi, idx) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            icon={kpiIcons[idx + 4] ?? PiggyBank}
            tone={kpi.tone as "success" | "warning" | "danger" | "info"}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Evolução do volume simulado</CardTitle>
              <p className="text-sm text-muted-foreground">Últimos 7 dias</p>
            </div>
            <Badge variant="secondary" className="rounded-full">
              +31,4%
            </Badge>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={simulationEvolution} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatCompactCurrency(v as number)}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    color: "var(--color-card-foreground)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                  }}
                  labelStyle={{ color: "var(--color-card-foreground)" }}
                  itemStyle={{ color: "var(--color-card-foreground)" }}
                  formatter={(v) => formatCurrency(Number(v))}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-primary)"
                  fill="url(#dashArea)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Status das negociações</CardTitle>
            <p className="text-sm text-muted-foreground">Distribuição atual</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                >
                  {statusData.map((_, idx) => (
                    <Cell key={idx} fill={pieColors[idx % pieColors.length]} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" iconType="circle" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    color: "var(--color-card-foreground)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                  }}
                  labelStyle={{ color: "var(--color-card-foreground)" }}
                  itemStyle={{ color: "var(--color-card-foreground)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Simulações recentes</CardTitle>
              <p className="text-sm text-muted-foreground">Atualizado agora</p>
            </div>
            <Button variant="ghost" asChild>
              <Link to="/simulacoes">
                Ver todas <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSimulations.map((sim) => {
              const totals = getSimulationTotals(sim);
              return (
                <div
                  key={sim.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-border bg-background/40 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{sim.number}</span>
                      <StatusBadge status={sim.status} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {sim.client} • {sim.owner}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(totals.revenue)}
                    </p>
                    <p
                      className={`text-xs font-medium ${totals.marginPercent >= MINIMUM_MARGIN_TARGET ? "text-success" : totals.marginPercent >= ATTENTION_MARGIN_TARGET ? "text-warning" : "text-danger"}`}
                    >
                      Margem {formatPercent(totals.marginPercent)}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Top clientes</CardTitle>
            <p className="text-sm text-muted-foreground">Volume nos últimos 30 dias</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {topClients.length ? (
              topClients.map((client) => {
                const max = topClients[0].value;
                return (
                  <div key={client.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{client.name}</span>
                      <span className="text-muted-foreground">
                        {formatCompactCurrency(client.value)}
                      </span>
                    </div>
                    <Progress value={(client.value / max) * 100} className="h-2" />
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum cliente no seu fluxo.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Últimos pedidos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Acompanhe o status logístico em andamento.
            </p>
          </div>
          <Button variant="ghost" asChild>
            <Link to="/pedidos">
              Ver todos <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          {recentOrders.map((order) => (
            <div
              key={order.id}
              className="space-y-3 rounded-2xl border border-border bg-background/40 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{order.number}</span>
                <StatusBadge status={order.status} />
              </div>
              <p className="text-sm text-muted-foreground">{order.client}</p>
              <p className="text-sm text-muted-foreground">
                {order.origin} → {order.destination}
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Entrega</span>
                  <span>{order.deliveryProgress}%</span>
                </div>
                <Progress value={order.deliveryProgress} className="h-2" />
              </div>
              <p className="text-xs text-muted-foreground">
                Previsão: {formatDateTime(order.expectedDelivery)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
