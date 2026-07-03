import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, MapPin, Plus, Truck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/features/app/app-context";
import type { FreightRecord } from "@/data/types";
import {
  createFreightFromOrder,
  getFreightStatusLabel,
  getNextFreightStatus,
  updateOrderFromFreight,
} from "@/features/freights/freightHelpers";
import { formatCurrency, formatDate } from "@/lib/format";
import { belongsToUser, canViewAllFlows, filterOrdersForUser } from "@/lib/visibility";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/fretes")({
  component: FreightsPage,
});

function FreightsPage() {
  const { auth, orders, freights, upsertFreight, upsertOrder } = useAppContext();
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleOrderIds = useMemo(
    () => new Set(visibleOrders.map((order) => order.id)),
    [visibleOrders],
  );
  const visibleFreights = useMemo(
    () =>
      freights.filter((freight) => {
        if (canViewAllFlows(auth.user)) return true;
        return (
          visibleOrderIds.has(freight.orderId ?? "") || belongsToUser(freight.owner, auth.user)
        );
      }),
    [auth.user, freights, visibleOrderIds],
  );
  const eligibleOrders = visibleOrders.filter(
    (order) =>
      order.status !== "Aguardando faturamento" &&
      order.status !== "Em faturamento" &&
      !freights.some((freight) => freight.orderId === order.id),
  );
  const total = visibleFreights.length;
  const transit = visibleFreights.filter((f) => f.status === "in_route").length;
  const value = visibleFreights.reduce((s, f) => s + f.freightValue, 0);

  const handleGenerateFreights = () => {
    if (eligibleOrders.length === 0) {
      toast.info("Não há pedidos liberados sem frete.");
      return;
    }

    eligibleOrders.forEach((order) => upsertFreight(createFreightFromOrder(order)));
    toast.success("Fretes gerados a partir dos pedidos liberados.");
  };

  const handleAdvanceFreight = (freight: FreightRecord) => {
    const nextStatus = getNextFreightStatus(freight.status);
    if (nextStatus === freight.status) return;

    const nextFreight: FreightRecord = {
      ...freight,
      status: nextStatus,
      deliveredAt: nextStatus === "delivered" ? new Date().toISOString() : freight.deliveredAt,
    };
    upsertFreight(nextFreight);

    const order = orders.find((item) => item.id === freight.orderId);
    if (order) upsertOrder(updateOrderFromFreight(order, nextFreight));

    toast.success(`Frete atualizado para ${getFreightStatusLabel(nextStatus)}.`);
  };

  const columns: DataColumn<FreightRecord>[] = [
    { key: "code", header: "Frete", cell: (f) => <span className="font-semibold">{f.code}</span> },
    { key: "order", header: "Pedido", cell: (f) => f.orderNumber ?? "-" },
    { key: "carrier", header: "Transportadora", cell: (f) => f.carrierName },
    {
      key: "vehicle",
      header: "Veículo",
      cell: (f) => (
        <Badge variant="outline" className="rounded-full">
          {f.vehicleDescription}
        </Badge>
      ),
    },
    {
      key: "route",
      header: "Trajeto",
      cell: (f) => <span className="text-sm text-muted-foreground">{f.route}</span>,
    },
    { key: "weight", header: "Volume", cell: (f) => f.weight },
    {
      key: "value",
      header: "Valor",
      className: "text-right",
      cell: (f) => <span className="font-medium">{formatCurrency(f.freightValue)}</span>,
    },
    { key: "loading", header: "Carregamento", cell: (f) => formatDate(f.pickupDate) },
    {
      key: "status",
      header: "Status",
      cell: (f) => <StatusBadge status={getFreightStatusLabel(f.status)} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (f) => (
        <Button
          size="sm"
          variant="outline"
          disabled={f.status === "delivered" || f.status === "cancelled"}
          onClick={(event) => {
            event.stopPropagation();
            handleAdvanceFreight(f);
          }}
        >
          <ArrowRight />
          Avançar
        </Button>
      ),
    },
  ];

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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Painel de fretes</CardTitle>
          <Button size="sm" variant="soft" onClick={handleGenerateFreights}>
            <Plus />
            Gerar fretes dos pedidos
          </Button>
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
