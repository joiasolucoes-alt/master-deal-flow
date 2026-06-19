import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { ViabilityBadge } from "@/components/app/viability-badge";
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
import { useAppContext } from "@/features/app/app-context";
import { getSimulationTotals } from "@/lib/calculations";
import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { BadgeDollarSign, CheckCircle2, FileSpreadsheet, TriangleAlert } from "lucide-react";
import type { Simulation } from "@/data/types";

export const Route = createFileRoute("/_app/simulacoes/")({
  component: SimulationsPage,
});

const statusOptions = [
  "Todos",
  "Rascunho",
  "Pendente de aprovação",
  "Aprovada",
  "Reprovada",
  "Ajuste solicitado",
];

function SimulationsPage() {
  const navigate = useNavigate();
  const { simulations } = useAppContext();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");
  const [owner, setOwner] = useState("Todos");

  const owners = useMemo(
    () => ["Todos", ...Array.from(new Set(simulations.map((s) => s.owner)))],
    [simulations],
  );

  const filtered = useMemo(
    () =>
      simulations.filter((sim) => {
        if (status !== "Todos" && sim.status !== status) return false;
        if (owner !== "Todos" && sim.owner !== owner) return false;
        if (
          search &&
          !`${sim.number} ${sim.client} ${sim.supplier}`
            .toLowerCase()
            .includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [simulations, search, status, owner],
  );

  const summary = useMemo(() => {
    const total = simulations.length;
    const approved = simulations.filter((s) => s.status === "Aprovada").length;
    const pending = simulations.filter(
      (s) =>
        s.status === "Pendente de aprovação" ||
        s.status === "Em análise" ||
        s.status === "Rascunho",
    ).length;
    const revenue = simulations.reduce((sum, s) => sum + getSimulationTotals(s).revenue, 0);
    return { total, approved, pending, revenue };
  }, [simulations]);

  const columns: DataColumn<Simulation>[] = [
    {
      key: "number",
      header: "Simulação",
      cell: (s) => <span className="font-semibold text-foreground">{s.number}</span>,
    },
    {
      key: "client",
      header: "Cliente",
      cell: (s) => (
        <div>
          <div>{s.client}</div>
          <div className="text-xs text-muted-foreground">{s.supplier}</div>
        </div>
      ),
    },
    { key: "owner", header: "Responsável", cell: (s) => s.owner },
    { key: "created", header: "Criada em", cell: (s) => formatDate(s.createdAt) },
    {
      key: "revenue",
      header: "Receita",
      className: "text-right",
      cell: (s) => (
        <span className="font-medium">{formatCurrency(getSimulationTotals(s).revenue)}</span>
      ),
    },
    {
      key: "margin",
      header: "Margem",
      className: "text-right",
      cell: (s) => {
        const totals = getSimulationTotals(s);
        return (
          <span
            className={
              totals.marginPercent >= MINIMUM_MARGIN_TARGET
                ? "text-success font-medium"
                : totals.marginPercent >= ATTENTION_MARGIN_TARGET
                  ? "text-warning font-medium"
                  : "text-danger font-medium"
            }
          >
            {formatPercent(totals.marginPercent)}
          </span>
        );
      },
    },
    {
      key: "viability",
      header: "Viabilidade",
      cell: (s) => <ViabilityBadge viability={getSimulationTotals(s).viability} compact />,
    },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    {
      key: "actions",
      header: "",
      cell: (s) => (
        <Button asChild variant="ghost" size="sm">
          <Link to="/simulacoes/$id" params={{ id: s.id }}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de simulações"
        description="Consulte, edite e crie simulações para apoiar a tomada de decisão comercial."
        action={
          <Button onClick={() => navigate({ to: "/simulacoes/$id", params: { id: "nova" } })}>
            <Plus /> Nova simulação
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total de simulações"
          value={String(summary.total)}
          icon={FileSpreadsheet}
          tone="info"
        />
        <StatCard
          label="Aprovadas"
          value={String(summary.approved)}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Pendentes / rascunho"
          value={String(summary.pending)}
          icon={TriangleAlert}
          tone="warning"
        />
        <StatCard
          label="Receita simulada"
          value={formatCurrency(summary.revenue)}
          icon={BadgeDollarSign}
          tone="success"
        />
      </div>

      <FilterBar
        onClear={() => {
          setSearch("");
          setStatus("Todos");
          setOwner("Todos");
        }}
      >
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Buscar</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Número, cliente ou fornecedor"
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
              {statusOptions.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Responsável</span>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
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
        emptyTitle="Nenhuma simulação encontrada"
        emptyDescription="Crie uma nova simulação ou ajuste os filtros aplicados."
        onRowClick={(row) => navigate({ to: "/simulacoes/$id", params: { id: row.id } })}
      />
    </div>
  );
}
