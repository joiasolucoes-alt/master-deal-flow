import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/useAppStore";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Negotiation } from "@/data/types";

export const Route = createFileRoute("/_app/negociacoes")({
  component: NegotiationsPage,
});

function NegotiationsPage() {
  const negotiations = useAppStore((store) => store.negotiations);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("Todas");
  const [status, setStatus] = useState("Todos");

  const filtered = useMemo(() => {
    return negotiations.filter((item) => {
      if (stage !== "Todas" && item.stage !== stage) return false;
      if (status !== "Todos" && item.status !== status) return false;
      if (
        search &&
        !`${item.number} ${item.client} ${item.owner}`.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [negotiations, search, stage, status]);

  const columns: DataColumn<Negotiation>[] = [
    {
      key: "number",
      header: "Negociação",
      cell: (n) => <span className="font-semibold text-foreground">{n.number}</span>,
    },
    { key: "client", header: "Cliente", cell: (n) => n.client },
    { key: "owner", header: "Responsável", cell: (n) => n.owner },
    {
      key: "stage",
      header: "Etapa",
      cell: (n) => (
        <Badge variant="outline" className="rounded-full">
          {n.stage}
        </Badge>
      ),
    },
    {
      key: "value",
      header: "Valor previsto",
      className: "text-right",
      cell: (n) => <span className="font-medium">{formatCurrency(n.expectedValue)}</span>,
    },
    {
      key: "margin",
      header: "Margem",
      className: "text-right",
      cell: (n) => formatPercent(n.marginPercent),
    },
    {
      key: "action",
      header: "Próxima ação",
      cell: (n) => <span className="text-sm text-muted-foreground">{n.nextAction}</span>,
    },
    { key: "status", header: "Status", cell: (n) => <StatusBadge status={n.status} /> },
  ];
  const stageDescriptions = [
    ["Oportunidade", "Contato ou demanda ainda em avaliação comercial."],
    ["Simulação", "Valores, custos, despesas e margem estão sendo montados."],
    ["Aprovação", "Simulação enviada para análise do responsável aprovador."],
    ["Pedido", "Negociação aprovada e convertida em pedido operacional."],
    ["Concluída", "Fluxo finalizado após entrega, recebimento e fechamento."],
    ["Cancelada", "Negociação encerrada sem seguir para pedido."],
  ];
  const statusDescriptions = [
    ["Aberta", "Ainda existe ação comercial em andamento."],
    ["Aguardando definição", "Depende de retorno, ajuste ou decisão antes de avançar."],
    ["Aprovada", "Condição comercial validada para seguir o fluxo."],
    ["Convertida", "Já virou pedido dentro do sistema."],
    ["Cancelada", "Não seguirá no fluxo."],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Negociações"
        description="Gerencie todo o pipeline comercial e acompanhe o estágio de cada oportunidade."
        action={
          <Button asChild>
            <Link to="/simulacoes">
              <Plus /> Nova negociação
            </Link>
          </Button>
        }
      />

      <FilterBar
        onClear={() => {
          setSearch("");
          setStage("Todas");
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
              placeholder="Cliente, número, responsável"
              className="pl-9"
            />
          </div>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Etapa</span>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "Todas",
                "Oportunidade",
                "Simulação",
                "Aprovação",
                "Pedido",
                "Concluída",
                "Cancelada",
              ].map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "Todos",
                "Aberta",
                "Aguardando definição",
                "Aprovada",
                "Convertida",
                "Cancelada",
              ].map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </FilterBar>

      <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-card lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Etapas</h2>
          <div className="mt-3 grid gap-2 text-sm">
            {stageDescriptions.map(([label, description]) => (
              <p key={label} className="text-muted-foreground">
                <span className="font-medium text-foreground">{label}:</span> {description}
              </p>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Status</h2>
          <div className="mt-3 grid gap-2 text-sm">
            {statusDescriptions.map(([label, description]) => (
              <p key={label} className="text-muted-foreground">
                <span className="font-medium text-foreground">{label}:</span> {description}
              </p>
            ))}
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="Nenhuma negociação encontrada"
        emptyDescription="Ajuste os filtros ou crie uma nova negociação para começar."
      />
    </div>
  );
}
