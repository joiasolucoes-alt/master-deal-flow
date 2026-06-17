import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, Search } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { orders } from "@/data/orders";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Order } from "@/data/types";
import { Boxes, PackageCheck, Truck, TruckIcon } from "lucide-react";

export const Route = createFileRoute("/_app/pedidos/")({
  component: OrdersPage,
});

function OrdersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (status !== "Todos" && o.status !== status) return false;
        if (search && !`${o.number} ${o.client}`.toLowerCase().includes(search.toLowerCase()))
          return false;
        return true;
      }),
    [search, status],
  );

  const summary = useMemo(
    () => ({
      total: orders.length,
      transit: orders.filter((o) => o.status === "Em rota").length,
      separation: orders.filter((o) => o.status === "Em separação").length,
      delivered: orders.filter((o) => o.status === "Entregue").length,
      value: orders.reduce((sum, o) => sum + o.totalValue, 0),
    }),
    [],
  );

  const columns: DataColumn<Order>[] = [
    {
      key: "number",
      header: "Pedido",
      cell: (o) => <span className="font-semibold text-foreground">{o.number}</span>,
    },
    { key: "client", header: "Cliente", cell: (o) => o.client },
    {
      key: "route",
      header: "Trajeto",
      cell: (o) => (
        <span className="text-sm text-muted-foreground">
          {o.origin} → {o.destination}
        </span>
      ),
    },
    {
      key: "value",
      header: "Valor",
      className: "text-right",
      cell: (o) => formatCurrency(o.totalValue),
    },
    {
      key: "billing",
      header: "Faturamento",
      cell: (o) => (
        <div className="w-32 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span>{o.billingProgress}%</span>
          </div>
          <Progress value={o.billingProgress} className="h-2" />
        </div>
      ),
    },
    {
      key: "delivery",
      header: "Entrega",
      cell: (o) => (
        <div className="w-32 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span>{o.deliveryProgress}%</span>
          </div>
          <Progress value={o.deliveryProgress} className="h-2" />
        </div>
      ),
    },
    { key: "expected", header: "Previsão", cell: (o) => formatDate(o.expectedDelivery) },
    { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
    {
      key: "actions",
      header: "",
      cell: (o) => (
        <Button asChild variant="ghost" size="sm">
          <Link to="/pedidos/$id" params={{ id: o.id }}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        description="Pedidos gerados a partir das simulações aprovadas e seu status logístico."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pedidos ativos" value={String(summary.total)} icon={Boxes} tone="info" />
        <StatCard
          label="Em separação"
          value={String(summary.separation)}
          icon={Truck}
          tone="warning"
        />
        <StatCard label="Em rota" value={String(summary.transit)} icon={TruckIcon} tone="info" />
        <StatCard
          label="Entregues"
          value={String(summary.delivered)}
          icon={PackageCheck}
          tone="success"
        />
      </div>

      <FilterBar
        onClear={() => {
          setSearch("");
          setStatus("Todos");
        }}
      >
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Buscar</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Número ou cliente"
              className="pl-9"
            />
          </div>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Todos", "Em faturamento", "Em separação", "Em rota", "Entregue"].map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(row) => navigate({ to: "/pedidos/$id", params: { id: row.id } })}
        emptyTitle="Nenhum pedido encontrado"
        emptyDescription="Tente ajustar os filtros para visualizar pedidos."
      />
    </div>
  );
}
