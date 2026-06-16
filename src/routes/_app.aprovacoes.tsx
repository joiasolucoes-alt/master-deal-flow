import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, MessageSquare, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ViabilityBadge } from "@/components/app/viability-badge";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAppContext } from "@/features/app/app-context";
import { getSimulationTotals } from "@/lib/calculations";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/format";
import { ClipboardCheck, FileWarning, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import type { Simulation } from "@/data/types";

export const Route = createFileRoute("/_app/aprovacoes")({
  component: ApprovalsPage,
});

const CHECKLIST: { key: keyof NonNullable<Simulation["approvalChecklist"]>; label: string }[] = [
  { key: "assumptionsReviewed", label: "Premissas comerciais revisadas" },
  { key: "marginValidated", label: "Margem validada com a meta da unidade" },
  { key: "costsChecked", label: "Custos e impostos conferidos" },
  { key: "notesRegistered", label: "Notas e justificativas registradas" },
];

function ApprovalsPage() {
  const { simulations, upsertSimulation, selectedApprovalId, setSelectedApprovalId } = useAppContext();
  const pending = useMemo(
    () => simulations.filter((s) => s.status === "Em análise" || s.status === "Ajuste solicitado" || s.status === "Rascunho"),
    [simulations],
  );
  const selected = pending.find((s) => s.id === selectedApprovalId) ?? pending[0] ?? null;
  const [comment, setComment] = useState("");

  const summary = useMemo(() => {
    const totalValue = pending.reduce((sum, s) => sum + getSimulationTotals(s).revenue, 0);
    const critical = pending.filter((s) => s.priority === "Alta" || s.priority === "Crítica").length;
    return { totalValue, critical };
  }, [pending]);

  function updateChecklist(key: keyof NonNullable<Simulation["approvalChecklist"]>, value: boolean) {
    if (!selected) return;
    const checklist = { assumptionsReviewed: false, marginValidated: false, costsChecked: false, notesRegistered: false, ...(selected.approvalChecklist ?? {}) };
    upsertSimulation({ ...selected, approvalChecklist: { ...checklist, [key]: value } });
  }

  function decide(decision: "approve" | "reject" | "adjust") {
    if (!selected) return;
    const map = { approve: "Aprovada", reject: "Reprovada", adjust: "Ajuste solicitado" } as const;
    upsertSimulation({ ...selected, status: map[decision], approvalNotes: comment || selected.approvalNotes });
    toast.success(`Simulação ${map[decision].toLowerCase()}`);
    setComment("");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Central de aprovações" description="Analise simulações em fila e tome decisões com base em margem e viabilidade." />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Aguardando aprovação" value={String(pending.length)} icon={ClipboardCheck} tone="info" />
        <StatCard label="Valor em análise" value={formatCurrency(summary.totalValue)} icon={ThumbsUp} tone="success" />
        <StatCard label="Alta prioridade" value={String(summary.critical)} icon={FileWarning} tone="warning" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card className="shadow-card">
          <CardHeader><CardTitle>Fila de aprovação</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px]">
              <div className="space-y-1 p-3">
                {pending.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sem simulações pendentes.</p>}
                {pending.map((sim) => {
                  const totals = getSimulationTotals(sim);
                  const active = sim.id === selected?.id;
                  return (
                    <button
                      key={sim.id}
                      onClick={() => setSelectedApprovalId(sim.id)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${active ? "border-primary bg-primary-soft" : "border-transparent hover:bg-muted/50"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{sim.number}</span>
                        <ViabilityBadge viability={totals.viability} compact />
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{sim.client}</p>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <StatusBadge status={sim.status} />
                        <span>{formatCurrency(totals.revenue)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {selected ? <ApprovalDetails simulation={selected} comment={comment} setComment={setComment} onUpdate={updateChecklist} onDecide={decide} /> : (
          <Card className="grid place-items-center p-12 shadow-card">
            <p className="text-muted-foreground">Selecione uma simulação na fila para iniciar a análise.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function ApprovalDetails({
  simulation, comment, setComment, onUpdate, onDecide,
}: {
  simulation: Simulation;
  comment: string;
  setComment: (v: string) => void;
  onUpdate: (key: keyof NonNullable<Simulation["approvalChecklist"]>, value: boolean) => void;
  onDecide: (decision: "approve" | "reject" | "adjust") => void;
}) {
  const totals = getSimulationTotals(simulation);
  const checklist = { assumptionsReviewed: false, marginValidated: false, costsChecked: false, notesRegistered: false, ...(simulation.approvalChecklist ?? {}) };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{simulation.number}</CardTitle>
            <p className="text-sm text-muted-foreground">{simulation.client} • {simulation.supplier}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={simulation.status} />
            <ViabilityBadge viability={totals.viability} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-4">
          <KV label="Receita" value={formatCurrency(totals.revenue)} />
          <KV label="Custo" value={formatCurrency(totals.merchandiseCost)} />
          <KV label="Despesas" value={formatCurrency(totals.expenses)} />
          <KV label="Lucro líquido" value={formatCurrency(totals.netProfit)} highlight />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <KV label="Margem" value={formatPercent(totals.marginPercent)} highlight />
          <KV label="Condição" value={simulation.paymentCondition} />
          <KV label="Prazo de entrega" value={formatDateTime(simulation.deliveryDate)} />
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Checklist do aprovador</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {CHECKLIST.map((item) => (
              <label key={item.key} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <Checkbox checked={checklist[item.key]} onCheckedChange={(v) => onUpdate(item.key, Boolean(v))} />
                <span className="text-sm">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Comentário interno</h3>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Adicione observações para o solicitante..." />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <ConfirmDialog
            trigger={<Button variant="outline"><RotateCcw /> Solicitar ajuste</Button>}
            title="Solicitar ajuste"
            description="A simulação retornará ao solicitante para revisão."
            actionLabel="Confirmar"
            onConfirm={() => onDecide("adjust")}
          />
          <ConfirmDialog
            trigger={<Button variant="outline" className="border-danger/30 text-danger hover:bg-danger-soft"><X /> Reprovar</Button>}
            title="Reprovar simulação"
            description="O solicitante será notificado da reprovação."
            actionLabel="Reprovar"
            onConfirm={() => onDecide("reject")}
          />
          <ConfirmDialog
            trigger={<Button><Check /> Aprovar</Button>}
            title="Aprovar simulação"
            description="A simulação ficará disponível para conversão em pedido."
            actionLabel="Aprovar"
            onConfirm={() => onDecide("approve")}
          />
        </div>

        {simulation.approvalNotes ? (
          <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground"><strong className="text-foreground">Histórico: </strong>{simulation.approvalNotes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 ${highlight ? "text-lg font-semibold text-foreground" : "font-medium text-foreground"}`}>{value}</p>
    </div>
  );
}
