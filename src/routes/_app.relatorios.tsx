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
import { Download, FileText, Share2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { negotiationStatus, simulationEvolution, topClients } from "@/data/dashboard";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { downloadTextFile, notifyActionUnavailable } from "@/lib/actions";

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Volume simulado x mês</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={simulationEvolution}>
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
                  tickFormatter={(v) => formatCompactCurrency(v as number)}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  contentStyle={{
                    background: "var(--color-card)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
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
              <BarChart data={topClients} layout="vertical">
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
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  width={160}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  contentStyle={{
                    background: "var(--color-card)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                  }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} fill="var(--color-primary)" />
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
    </div>
  );
}
