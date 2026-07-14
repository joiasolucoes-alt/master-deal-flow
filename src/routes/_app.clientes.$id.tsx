import { useMemo } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock, Percent, ShoppingCart, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Timeline } from "@/components/app/timeline";
import { EmptyState } from "@/components/app/empty-state";
import { InsightsPanel } from "@/components/app/insights-panel";
import { useAppContext } from "@/features/app/app-context";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/format";
import { filterOrdersForUser, filterSimulationsForUser } from "@/lib/visibility";
import {
  buildClientInsight,
  clientKey,
  type CrossSellSuggestion,
} from "@/features/insights/clientInsights";
import type { NegotiationProductBreakdown } from "@/features/insights/negotiationInsights";

export const Route = createFileRoute("/_app/clientes/$id")({
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { id } = useParams({ from: "/_app/clientes/$id" });
  const { auth, simulations, orders, deliveries, financialTitles, freights, clients, products } =
    useAppContext();

  const visibleSimulations = useMemo(
    () => filterSimulationsForUser(simulations, auth.user),
    [auth.user, simulations],
  );
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);

  const clientName = useMemo(() => {
    const match =
      visibleSimulations.find((item) => clientKey(item.client) === id) ??
      visibleOrders.find((item) => clientKey(item.client) === id);
    return match?.client ?? null;
  }, [visibleSimulations, visibleOrders, id]);

  const insight = useMemo(
    () =>
      clientName
        ? buildClientInsight({
            clientName,
            simulations: visibleSimulations,
            orders: visibleOrders,
            deliveries,
            financialTitles,
            freights,
            clients,
            catalog: products,
          })
        : null,
    [clientName, visibleSimulations, visibleOrders, deliveries, financialTitles, freights, clients, products],
  );

  if (!clientName || !insight) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link to="/clientes">
            <ArrowLeft /> Voltar para clientes
          </Link>
        </Button>
        <Card className="shadow-card">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Cliente não encontrado.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, timeline, products: purchased, insights, crossSell } = insight;
  const location = [summary.city, summary.state].filter(Boolean).join(" • ");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/clientes">
          <ArrowLeft /> Voltar para clientes
        </Link>
      </Button>

      <PageHeader
        title={summary.name}
        description={location || "Histórico consolidado do cliente"}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Receita realizada"
          value={formatCompactCurrency(summary.realizedRevenue)}
          delta={`${summary.orderCount} pedidos`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Margem realizada"
          value={formatPercent(summary.realizedMarginPercent, 1)}
          delta={`${formatPercent(summary.predictedMarginPercent, 1)} prevista`}
          icon={Percent}
          tone={summary.realizedMarginPercent >= summary.predictedMarginPercent ? "success" : "danger"}
        />
        <StatCard
          label="Produtos comprados"
          value={String(summary.productCount)}
          delta={`${summary.simulationCount} simulações`}
          icon={ShoppingCart}
          tone="info"
        />
        <StatCard
          label="Saldo a receber"
          value={formatCompactCurrency(summary.receivableOpenTotal)}
          delta={formatCompactCurrency(summary.simulatedRevenue) + " simulado"}
          icon={CalendarClock}
          tone={summary.receivableOpenTotal > 0 ? "warning" : "success"}
        />
      </div>

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="crosssell">Cross-sell</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Histórico do cliente</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length > 0 ? (
                <Timeline items={timeline} />
              ) : (
                <EmptyState
                  title="Sem histórico"
                  description="Ainda não há simulações ou pedidos registrados para este cliente."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>O que o cliente mais compra</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={productColumns}
                data={purchased}
                emptyTitle="Nenhum produto"
                emptyDescription="Os produtos comprados aparecem aqui conforme os pedidos são registrados."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights">
          <InsightsPanel insights={insights} />
        </TabsContent>

        <TabsContent value="crosssell">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Sugestões de cross-sell</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={crossSellColumns}
                data={crossSell}
                emptyTitle="Sem sugestões"
                emptyDescription="Todos os produtos de destaque do catálogo já foram comprados por este cliente."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const productColumns: DataColumn<NegotiationProductBreakdown>[] = [
  {
    key: "product",
    header: "Produto",
    cell: (item) => (
      <div>
        <p className="font-semibold text-foreground">{item.product}</p>
        <p className="text-xs text-muted-foreground">{item.code}</p>
      </div>
    ),
  },
  {
    key: "quantity",
    header: "Quantidade",
    className: "text-right",
    cell: (item) => item.quantity.toLocaleString("pt-BR"),
  },
  {
    key: "revenue",
    header: "Receita",
    className: "text-right",
    cell: (item) => <span className="font-medium">{formatCurrency(item.revenue)}</span>,
  },
  {
    key: "margin",
    header: "Margem",
    className: "text-right",
    cell: (item) => formatPercent(item.marginPercent, 1),
  },
];

const crossSellColumns: DataColumn<CrossSellSuggestion>[] = [
  {
    key: "product",
    header: "Produto sugerido",
    cell: (item) => (
      <div>
        <p className="font-semibold text-foreground">{item.product}</p>
        <p className="text-xs text-muted-foreground">{item.code}</p>
      </div>
    ),
  },
  {
    key: "margin",
    header: "Margem do catálogo",
    className: "text-right",
    cell: (item) => <span className="text-success">{formatPercent(item.marginPercent, 1)}</span>,
  },
  {
    key: "reason",
    header: "Por quê",
    cell: (item) => <span className="text-sm text-muted-foreground">{item.reason}</span>,
  },
];
