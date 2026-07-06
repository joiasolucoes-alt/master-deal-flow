import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RotateCcw, Search, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { FilterBar } from "@/components/app/filter-bar";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/features/app/app-context";
import { createSupabaseSimulationRepository } from "@/features/simulations/repositories/supabaseSimulationRepository";
import type { Simulation } from "@/data/types";
import { getSimulationTotals } from "@/lib/calculations";
import { getSupabaseConfigStatus } from "@/lib/supabaseClient";
import { isSupabaseProvider } from "@/lib/dataProvider";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import {
  getSimulationAdjustmentReason,
  isSimulationAdjustmentRequested,
} from "@/lib/simulationStatus";
import { filterSimulationsForUser } from "@/lib/visibility";

export const Route = createFileRoute("/_app/reajustes")({
  component: AdjustmentsPage,
});

function AdjustmentsPage() {
  const navigate = useNavigate();
  const { auth, simulations, setSimulations } = useAppContext();
  const [search, setSearch] = useState("");
  const [remoteAdjustments, setRemoteAdjustments] = useState<Simulation[] | null>(null);
  const setSimulationsRef = useRef(setSimulations);
  const simulationsRef = useRef(simulations);

  useEffect(() => {
    setSimulationsRef.current = setSimulations;
  }, [setSimulations]);

  useEffect(() => {
    simulationsRef.current = simulations;
  }, [simulations]);

  useEffect(() => {
    if (!auth.hasAccess || !isSupabaseProvider() || !getSupabaseConfigStatus().configured) return;

    let cancelled = false;
    const repository = createSupabaseSimulationRepository();

    async function loadAdjustments() {
      try {
        const adjustments = repository.listAdjustments
          ? await repository.listAdjustments(auth.user)
          : [];
        if (cancelled) return;
        setRemoteAdjustments(adjustments);
        setSimulationsRef.current(mergeSimulations(simulationsRef.current, adjustments));
      } catch (error) {
        console.error("Falha ao atualizar reajustes pelo Supabase.", error);
      }
    }

    void loadAdjustments();

    return () => {
      cancelled = true;
    };
  }, [auth.hasAccess, auth.user]);

  const adjustmentSource = remoteAdjustments ?? simulations;
  const visibleSimulations = useMemo(
    () => filterSimulationsForUser(adjustmentSource, auth.user),
    [adjustmentSource, auth.user],
  );

  const adjustments = useMemo(
    () =>
      visibleSimulations.filter(isSimulationAdjustmentRequested).filter((simulation) => {
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return `${simulation.number} ${simulation.client} ${simulation.supplier} ${simulation.owner} ${getSimulationAdjustmentReason(
          simulation,
        )}`
          .toLowerCase()
          .includes(query);
      }),
    [search, visibleSimulations],
  );

  const summary = useMemo(() => {
    const revenue = adjustments.reduce(
      (total, simulation) => total + getSimulationTotals(simulation).revenue,
      0,
    );
    return { total: adjustments.length, revenue };
  }, [adjustments]);

  const columns: DataColumn<Simulation>[] = [
    {
      key: "number",
      header: "Simulação",
      cell: (simulation) => <span className="font-semibold">{simulation.number}</span>,
    },
    {
      key: "client",
      header: "Cliente",
      cell: (simulation) => (
        <div>
          <div className="font-medium text-foreground">{simulation.client}</div>
          <div className="text-xs text-muted-foreground">{simulation.supplier}</div>
        </div>
      ),
    },
    { key: "owner", header: "Responsável", cell: (simulation) => simulation.owner },
    { key: "created", header: "Criada em", cell: (simulation) => formatDate(simulation.createdAt) },
    {
      key: "revenue",
      header: "Receita",
      className: "text-right",
      cell: (simulation) => formatCurrency(getSimulationTotals(simulation).revenue),
    },
    {
      key: "margin",
      header: "Margem",
      className: "text-right",
      cell: (simulation) => formatPercent(getSimulationTotals(simulation).marginPercent),
    },
    {
      key: "reason",
      header: "Motivo do reajuste",
      cell: (simulation) => (
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {getSimulationAdjustmentReason(simulation)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (simulation) => <StatusBadge status="Ajuste solicitado" />,
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      cell: (simulation) => (
        <Button asChild size="sm" variant="outline">
          <Link to="/simulacoes/$id" params={{ id: simulation.id }}>
            Reajustar
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reajustes"
        description="Simulações devolvidas para revisão antes de uma nova aprovação."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          label="Reajustes pendentes"
          value={String(summary.total)}
          icon={RotateCcw}
          tone="warning"
        />
        <StatCard
          label="Receita em revisão"
          value={formatCurrency(summary.revenue)}
          icon={TriangleAlert}
          tone="info"
        />
      </div>

      <FilterBar onClear={() => setSearch("")}>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Buscar</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Número, cliente, fornecedor ou motivo"
              className="pl-9"
            />
          </div>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        data={adjustments}
        emptyTitle="Nenhum reajuste pendente"
        emptyDescription="Quando uma simulação voltar para ajuste, ela aparecerá aqui."
        onRowClick={(simulation) =>
          navigate({ to: "/simulacoes/$id", params: { id: simulation.id } })
        }
      />
    </div>
  );
}

function mergeSimulations(current: Simulation[], incoming: Simulation[]) {
  const byId = new Map(current.map((simulation) => [simulation.id, simulation]));
  for (const simulation of incoming) byId.set(simulation.id, simulation);
  return Array.from(byId.values());
}
