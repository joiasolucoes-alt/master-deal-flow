import { useMemo } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  FileSpreadsheet,
  Percent,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Timeline } from "@/components/app/timeline";
import { EmptyState } from "@/components/app/empty-state";
import { InsightsPanel } from "@/components/app/insights-panel";
import { useAppContext } from "@/features/app/app-context";
import { useAppStore } from "@/store/useAppStore";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/format";
import { belongsToUser, canViewAllFlows } from "@/lib/visibility";
import {
  buildNegotiationInsights,
  buildNegotiationMetrics,
  buildNegotiationProductBreakdown,
  buildNegotiationTimeline,
  getNegotiationLinkedRecords,
  type NegotiationProductBreakdown,
} from "@/features/insights/negotiationInsights";

export const Route = createFileRoute("/_app/negociacoes/$id")({
  component: NegotiationDetailPage,
});

function NegotiationDetailPage() {
  const { id } = useParams({ from: "/_app/negociacoes/$id" });
  const { auth, simulations, orders, deliveries, financialTitles, freights } = useAppContext();
  const negotiation = useAppStore((store) => store.negotiations.find((item) => item.id === id));
  const canViewNegotiation =
    negotiation && (canViewAllFlows(auth.user) || belongsToUser(negotiation.owner, auth.user));

  const linked = useMemo(
    () =>
      negotiation
        ? getNegotiationLinkedRecords({ negotiation, simulations, orders, deliveries })
        : { simulations: [], orders: [], deliveries: [] },
    [negotiation, simulations, orders, deliveries],
  );
  const timeline = useMemo(() => buildNegotiationTimeline(linked), [linked]);
  const products = useMemo(() => buildNegotiationProductBreakdown(linked), [linked]);
  const metrics = useMemo(
    () =>
      negotiation
        ? buildNegotiationMetrics({ negotiation, linked, financialTitles, freights })
        : null,
    [negotiation, linked, financialTitles, freights],
  );
  const insights = useMemo(
    () => (metrics ? buildNegotiationInsights({ products, metrics }) : null),
    [products, metrics],
  );

  if (!negotiation || !canViewNegotiation) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link to="/negociacoes">
            <ArrowLeft /> Voltar para negociações
          </Link>
        </Button>
        <Card className="shadow-card">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Negociação não encontrada.
          </CardContent>
        </Card>
      </div>
    );
  }

  const realizedTone = metrics && metrics.marginDeltaPercent >= 0 ? "success" : "danger";

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/negociacoes">
          <ArrowLeft /> Voltar para negociações
        </Link>
      </Button>

      <PageHeader
        title={negotiation.number}
        description={`${negotiation.client} • Responsável: ${negotiation.owner}`}
        action={
          <Button asChild>
            <Link to="/simulacoes">
              <FileSpreadsheet /> Ver simulações
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={negotiation.status} />
        <Badge variant="outline" className="rounded-full">
          Etapa: {negotiation.stage}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Valor previsto"
          value={formatCompactCurrency(negotiation.expectedValue)}
          delta={`${metrics?.simulationCount ?? 0} simulações`}
          icon={Target}
          tone="info"
        />
        <StatCard
          label="Receita realizada"
          value={formatCompactCurrency(metrics?.realizedRevenue ?? 0)}
          delta={`${metrics?.orderCount ?? 0} pedidos`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Margem realizada"
          value={formatPercent(metrics?.realizedMarginPercent ?? 0, 1)}
          delta={`${formatPercent(metrics?.predictedMarginPercent ?? 0, 1)} prevista`}
          icon={Percent}
          tone={realizedTone}
          trendPositive={(metrics?.marginDeltaPercent ?? 0) >= 0}
        />
        <StatCard
          label="Ciclo do negócio"
          value={metrics?.cycleDays != null ? `${metrics.cycleDays} dias` : "—"}
          delta={`${formatPercent(metrics?.conversionRate ?? 0, 0)} de conversão`}
          icon={CalendarClock}
          tone="warning"
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="products">Produtos &amp; margem</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Resumo da negociação</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Info label="Cliente" value={negotiation.client} />
                <Info label="Responsável" value={negotiation.owner} />
                <Info label="Valor previsto" value={formatCurrency(negotiation.expectedValue)} />
                <Info
                  label="Receita simulada"
                  value={formatCurrency(metrics?.simulatedRevenue ?? 0)}
                />
                <Info label="Receita realizada" value={formatCurrency(metrics?.realizedRevenue ?? 0)} />
                <Info
                  label="Saldo a receber"
                  value={formatCurrency(metrics?.receivableOpenTotal ?? 0)}
                />
                <Info label="Etapa" value={negotiation.stage} />
                <Info label="Status" value={negotiation.status} />
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Próxima ação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{negotiation.nextAction}</p>
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase text-muted-foreground">
                    Previsto vs. realizado (margem)
                  </p>
                  <p
                    className={`mt-1 text-lg font-semibold ${
                      (metrics?.marginDeltaPercent ?? 0) >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatPercent(metrics?.marginDeltaPercent ?? 0, 1)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Linha do tempo do negócio</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length > 0 ? (
                <Timeline items={timeline} />
              ) : (
                <EmptyState
                  title="Sem histórico vinculado"
                  description="Ainda não há simulações ou pedidos vinculados a esta negociação (vínculo por cliente e responsável)."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Produtos, receita e margem</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={productColumns}
                data={products}
                emptyTitle="Nenhum produto vinculado"
                emptyDescription="Os produtos aparecem aqui conforme simulações e pedidos são vinculados ao negócio."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights">
          {insights ? (
            <InsightsPanel insights={insights} />
          ) : (
            <EmptyState
              title="Sem insights disponíveis"
              description="Vincule simulações e pedidos ao negócio para gerar destaques de produto e recomendações."
            />
          )}
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
        <p className="text-xs text-muted-foreground">
          {item.code} • {item.source}
        </p>
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
    key: "profit",
    header: "Lucro",
    className: "text-right",
    cell: (item) => (
      <span className={item.profit >= 0 ? "text-success" : "text-danger"}>
        {formatCurrency(item.profit)}
      </span>
    ),
  },
  {
    key: "margin",
    header: "Margem",
    className: "text-right",
    cell: (item) => formatPercent(item.marginPercent, 1),
  },
];

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}
