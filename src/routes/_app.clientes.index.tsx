import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, Users, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatCard } from "@/components/app/stat-card";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/features/app/app-context";
import {
  filterOrdersForUser,
  filterSimulationsForUser,
} from "@/lib/visibility";
import { formatCompactCurrency, formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { buildClientDirectory, type ClientSummary } from "@/features/insights/clientInsights";

export const Route = createFileRoute("/_app/clientes/")({
  component: ClientsPage,
});

function ClientsPage() {
  const { auth, simulations, orders, deliveries, financialTitles, freights, clients } =
    useAppContext();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const visibleSimulations = useMemo(
    () => filterSimulationsForUser(simulations, auth.user),
    [auth.user, simulations],
  );
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);

  const directory = useMemo(
    () =>
      buildClientDirectory({
        clients,
        simulations: visibleSimulations,
        orders: visibleOrders,
        deliveries,
        financialTitles,
        freights,
      }),
    [clients, visibleSimulations, visibleOrders, deliveries, financialTitles, freights],
  );

  const filtered = useMemo(() => {
    if (!search) return directory;
    const term = search.toLowerCase();
    return directory.filter((client) =>
      `${client.name} ${client.city ?? ""} ${client.state ?? ""}`.toLowerCase().includes(term),
    );
  }, [directory, search]);

  const totalRealized = directory.reduce((sum, client) => sum + client.realizedRevenue, 0);

  const columns: DataColumn<ClientSummary>[] = [
    {
      key: "name",
      header: "Cliente",
      cell: (client) => (
        <div>
          <p className="font-semibold text-foreground">{client.name}</p>
          {client.city ? (
            <p className="text-xs text-muted-foreground">
              {client.city}
              {client.state ? ` • ${client.state}` : ""}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "orders",
      header: "Negócios",
      className: "text-right",
      cell: (client) => `${client.orderCount} ped. / ${client.simulationCount} sim.`,
    },
    {
      key: "realizedRevenue",
      header: "Receita realizada",
      className: "text-right",
      cell: (client) => (
        <span className="font-medium">{formatCurrency(client.realizedRevenue)}</span>
      ),
    },
    {
      key: "margin",
      header: "Margem realizada",
      className: "text-right",
      cell: (client) => formatPercent(client.realizedMarginPercent, 1),
    },
    {
      key: "last",
      header: "Última atividade",
      className: "text-right",
      cell: (client) =>
        client.lastActivityAt ? (
          formatDate(client.lastActivityAt)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Explore o histórico, os produtos e a rentabilidade de cada cliente para preparar a próxima venda."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Clientes ativos"
          value={String(directory.length)}
          delta={`${directory.filter((c) => c.orderCount > 0).length} com pedidos`}
          icon={Users}
          tone="info"
        />
        <StatCard
          label="Receita realizada"
          value={formatCompactCurrency(totalRealized)}
          delta="Somatório dos clientes"
          icon={WalletCards}
          tone="success"
        />
      </div>

      <FilterBar onClear={() => setSearch("")}>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Buscar</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, cidade, estado"
              className="pl-9"
            />
          </div>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(client) => navigate({ to: "/clientes/$id", params: { id: client.key } })}
        emptyTitle="Nenhum cliente encontrado"
        emptyDescription="Clientes aparecem aqui conforme simulações e pedidos são registrados."
      />
    </div>
  );
}
