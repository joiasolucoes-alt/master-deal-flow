import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Truck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/features/app/app-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { belongsToUser, canViewAllFlows } from "@/lib/visibility";

export const Route = createFileRoute("/_app/fretes")({
  component: FreightsPage,
});

interface Freight {
  id: string;
  code: string;
  carrier: string;
  vehicle: string;
  route: string;
  value: number;
  weight: string;
  status: "Cotação" | "Aprovado" | "Em rota" | "Entregue";
  loading: string;
  owner: string;
}

const freights: Freight[] = [
  {
    id: "f1",
    code: "FR-2024-0091",
    carrier: "Transportes União",
    vehicle: "Truck baú 18t",
    route: "Cataguases → Juiz de Fora",
    value: 12450,
    weight: "11.4t",
    status: "Em rota",
    loading: "2026-06-15T08:00:00-03:00",
    owner: "Pedro Costa",
  },
  {
    id: "f2",
    code: "FR-2024-0090",
    carrier: "Logmix",
    vehicle: "Carreta LS 30t",
    route: "Vitória → Belo Horizonte",
    value: 18900,
    weight: "22.8t",
    status: "Aprovado",
    loading: "2026-06-18T07:30:00-03:00",
    owner: "Carla Mendes",
  },
  {
    id: "f3",
    code: "FR-2024-0089",
    carrier: "Serra Logística",
    vehicle: "Truck 14t",
    route: "Ipatinga → Governador Valadares",
    value: 8600,
    weight: "9.6t",
    status: "Cotação",
    loading: "2026-06-19T09:00:00-03:00",
    owner: "João Silva",
  },
  {
    id: "f4",
    code: "FR-2024-0088",
    carrier: "Transportes União",
    vehicle: "Truck baú 18t",
    route: "Cataguases → Campos dos Goytacazes",
    value: 16500,
    weight: "14.2t",
    status: "Entregue",
    loading: "2026-06-10T06:00:00-03:00",
    owner: "Ana Paula",
  },
];

const columns: DataColumn<Freight>[] = [
  { key: "code", header: "Frete", cell: (f) => <span className="font-semibold">{f.code}</span> },
  { key: "carrier", header: "Transportadora", cell: (f) => f.carrier },
  {
    key: "vehicle",
    header: "Veículo",
    cell: (f) => (
      <Badge variant="outline" className="rounded-full">
        {f.vehicle}
      </Badge>
    ),
  },
  {
    key: "route",
    header: "Trajeto",
    cell: (f) => <span className="text-sm text-muted-foreground">{f.route}</span>,
  },
  { key: "weight", header: "Peso", cell: (f) => f.weight },
  {
    key: "value",
    header: "Valor",
    className: "text-right",
    cell: (f) => <span className="font-medium">{formatCurrency(f.value)}</span>,
  },
  { key: "loading", header: "Carregamento", cell: (f) => formatDate(f.loading) },
  {
    key: "status",
    header: "Status",
    cell: (f) => (
      <StatusBadge
        status={
          f.status === "Cotação"
            ? "Em análise"
            : f.status === "Aprovado"
              ? "Aprovada"
              : f.status === "Em rota"
                ? "Em rota"
                : "Entregue"
        }
      />
    ),
  },
];

function FreightsPage() {
  const { auth } = useAppContext();
  const visibleFreights = canViewAllFlows(auth.user)
    ? freights
    : freights.filter((freight) => belongsToUser(freight.owner, auth.user));
  const total = visibleFreights.length;
  const transit = visibleFreights.filter((f) => f.status === "Em rota").length;
  const value = visibleFreights.reduce((s, f) => s + f.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fretes"
        description="Controle de cotações, contratações e rastreamento de frete."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Fretes ativos" value={String(total)} icon={Truck} tone="info" />
        <StatCard label="Em rota" value={String(transit)} icon={MapPin} tone="warning" />
        <StatCard
          label="Valor contratado"
          value={formatCurrency(value)}
          icon={Truck}
          tone="success"
        />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Painel de fretes</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={visibleFreights}
            emptyTitle="Sem fretes"
            emptyDescription="Nenhum frete contratado no momento."
          />
        </CardContent>
      </Card>
    </div>
  );
}
