import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, MessageSquare, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ViabilityBadge } from "@/components/app/viability-badge";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAppContext } from "@/features/app/app-context";
import { getSimulationTotals } from "@/lib/calculations";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/format";
import { ClipboardCheck, FileWarning, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import type { ApprovalStage, Simulation, User } from "@/data/types";
import { convertSimulationToOrder } from "@/features/simulations/services/simulationService";
import { createNegotiationWallet } from "@/features/negotiation-wallets";
import { useAppStore } from "@/store/useAppStore";
import { canReviewApprovals, isPendingApprovalStatus } from "@/lib/permissions";
import {
  APPROVAL_STAGE_LABELS,
  applyApprovalDecision,
  canUserDecideApprovalStage,
  getApprovalFlow,
  getCurrentApprovalStage,
  isFinancialApprovalComplete,
} from "@/features/approvals/approvalFlow";
import { createSupabaseApprovalRepository } from "@/features/approvals/repositories/supabaseApprovalRepository";
import { createSupabaseSimulationRepository } from "@/features/simulations/repositories/supabaseSimulationRepository";
import { getSupabaseConfigStatus } from "@/lib/supabaseClient";
import { isSupabaseProvider } from "@/lib/dataProvider";

export const Route = createFileRoute("/_app/aprovacoes")({
  component: ApprovalsPage,
});

const CHECKLIST: { key: keyof NonNullable<Simulation["approvalChecklist"]>; label: string }[] = [
  { key: "assumptionsReviewed", label: "Premissas comerciais revisadas" },
  { key: "marginValidated", label: "Margem validada com a meta da unidade" },
  { key: "costsChecked", label: "Custos e impostos conferidos" },
  { key: "notesRegistered", label: "Notas e justificativas registradas" },
];

function saveApprovalDecision(payload: {
  simulationId: string;
  stage: ApprovalStage;
  approverId?: string;
  status: "pending" | "approved" | "adjustment_requested" | "rejected";
  checklist?: Record<string, unknown>;
  comment?: string;
  bankAccount?: string;
}) {
  if (!isSupabaseProvider()) return;
  if (!getSupabaseConfigStatus().configured) {
    toast.error("Supabase não configurado. Decisão ficou registrada apenas localmente.");
    return;
  }

  const repository = createSupabaseApprovalRepository();
  void repository
    .save({
      id: `apr-${payload.simulationId}-${payload.stage}`,
      ...payload,
      decidedAt: new Date().toISOString(),
    })
    .catch((error) => {
      console.error("Falha ao salvar decisão de aprovação no Supabase.", error);
      toast.error("Falha ao salvar decisão no Supabase. Fluxo local preservado.");
    });
}

function ApprovalsPage() {
  const {
    auth,
    simulations,
    setSimulations,
    orders,
    upsertSimulation,
    upsertOrder,
    upsertNegotiationWallet,
    selectedApprovalId,
    setSelectedApprovalId,
    users,
  } = useAppContext();
  const addNotification = useAppStore((store) => store.addNotification);
  const currentUser = auth.user;
  const canReview = canReviewApprovals(currentUser);
  const setSimulationsRef = useRef(setSimulations);

  useEffect(() => {
    setSimulationsRef.current = setSimulations;
  }, [setSimulations]);

  useEffect(() => {
    if (!auth.hasAccess || !canReview || !isSupabaseProvider()) return;
    if (!getSupabaseConfigStatus().configured) return;

    let cancelled = false;
    const repository = createSupabaseSimulationRepository();

    async function loadLatestSimulations() {
      try {
        const remoteSimulations = await repository.list();
        if (!cancelled) setSimulationsRef.current(remoteSimulations);
      } catch (error) {
        console.error("Falha ao atualizar fila de aprovações pelo Supabase.", error);
      }
    }

    void loadLatestSimulations();

    return () => {
      cancelled = true;
    };
  }, [auth.hasAccess, auth.user?.id, canReview]);
  const pending = useMemo(
    () =>
      simulations.filter((simulation) => {
        if (!isPendingApprovalStatus(simulation.status)) return false;
        const stage = getCurrentApprovalStage(simulation);
        return canUserDecideApprovalStage(currentUser, simulation, stage);
      }),
    [currentUser, simulations],
  );
  const selected = pending.find((s) => s.id === selectedApprovalId) ?? pending[0] ?? null;
  const [comment, setComment] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  const summary = useMemo(() => {
    const totalValue = pending.reduce((sum, s) => sum + getSimulationTotals(s).revenue, 0);
    const critical = pending.filter(
      (s) => s.priority === "Alta" || s.priority === "Crítica",
    ).length;
    return { totalValue, critical };
  }, [pending]);

  function updateChecklist(
    key: keyof NonNullable<Simulation["approvalChecklist"]>,
    value: boolean,
  ) {
    if (!selected) return;
    const stage = getCurrentApprovalStage(selected);
    if (!stage) return;
    const checklist = {
      assumptionsReviewed: false,
      marginValidated: false,
      costsChecked: false,
      notesRegistered: false,
      ...(selected.approvalChecklist ?? {}),
    };
    upsertSimulation({ ...selected, approvalChecklist: { ...checklist, [key]: value } });
    saveApprovalDecision({
      simulationId: selected.id,
      stage,
      approverId: currentUser?.id,
      status: "pending",
      checklist: { ...checklist, [key]: value },
      comment: selected.approvalNotes,
      bankAccount,
    });
  }

  function decide(decision: "approve" | "reject" | "adjust") {
    if (!selected) return;
    const stage = getCurrentApprovalStage(selected);

    if (!stage || !canReviewApprovals(currentUser)) {
      toast.error("Seu perfil não pode decidir aprovações.");
      return;
    }
    if (!canUserDecideApprovalStage(currentUser, selected, stage)) {
      toast.error("Seu perfil não pode decidir esta etapa.");
      return;
    }

    const checklist = selected.approvalChecklist;
    if (decision === "approve" && stage === "financial") {
      if (!checklist?.marginValidated || !checklist.costsChecked) {
        toast.error("Financeiro precisa validar margem e custos antes de aprovar.");
        return;
      }
      if (!bankAccount.trim()) {
        toast.error("Informe a conta bancária de saída antes de aprovar.");
        return;
      }
    }
    if (decision === "approve" && stage === "principal") {
      if (!isFinancialApprovalComplete(selected)) {
        toast.error("A aprovação financeira precisa ser concluída primeiro.");
        return;
      }
      if (
        !checklist?.assumptionsReviewed ||
        !checklist.marginValidated ||
        !checklist.costsChecked
      ) {
        toast.error("Conclua o checklist obrigatório antes de aprovar.");
        return;
      }
    }
    if (decision === "adjust" && !comment.trim()) {
      toast.error("Informe o motivo e comentário para solicitar ajuste.");
      return;
    }

    const repositoryStatus = {
      approve: "approved",
      reject: "rejected",
      adjust: "adjustment_requested",
    } as const;
    const nextSimulation = applyApprovalDecision(selected, stage, repositoryStatus[decision], {
      approverId: currentUser?.id,
      approverName: currentUser?.name,
      notes: comment || selected.approvalNotes,
      bankAccount: stage === "financial" ? bankAccount : undefined,
    });
    const ownerUser = findSimulationOwnerUser(users, selected);

    saveApprovalDecision({
      simulationId: selected.id,
      stage,
      approverId: currentUser?.id,
      status: repositoryStatus[decision],
      checklist: selected.approvalChecklist,
      comment: comment || selected.approvalNotes,
      bankAccount: stage === "financial" ? bankAccount : undefined,
    });

    if (decision === "approve" && nextSimulation.status === "Aprovada") {
      const existingOrder = orders.find((order) => order.simulationId === selected.id);
      if (existingOrder || selected.orderId) {
        upsertSimulation(nextSimulation);
        toast.success("Aprovação do Gestor registrada.");
      } else {
        const conversion = convertSimulationToOrder(
          nextSimulation,
          orders,
          auth.user?.id ?? "system",
        );
        upsertSimulation(conversion.simulation);
        upsertOrder(conversion.order);
        upsertNegotiationWallet(createNegotiationWallet(conversion.order, nextSimulation));
        addNotification({
          id: `not-${Date.now()}`,
          title: "Simulação aprovada",
          description: `${selected.number} foi aprovada e virou o pedido ${conversion.order.number}.`,
          type: "success",
          createdAt: new Date().toISOString(),
          unread: true,
          entityType: "order",
          entityId: conversion.order.id,
          targetUserName: selected.owner,
        });
        toast.success(`Aprovação do Gestor concluída e pedido ${conversion.order.number} criado.`);
      }
    } else {
      upsertSimulation(nextSimulation);
      addNotification({
        id: `not-${Date.now()}`,
        title:
          decision === "approve"
            ? "Etapa financeira aprovada"
            : decision === "adjust"
              ? "Ajuste solicitado para sua simulação"
              : "Simulação reprovada",
        description:
          decision === "adjust"
            ? `${selected.number} voltou para o Comercial: ${comment.trim()}`
            : `${selected.number}: ${APPROVAL_STAGE_LABELS[stage]}.`,
        type: decision === "adjust" ? "warning" : "info",
        createdAt: new Date().toISOString(),
        unread: true,
        entityType: "simulation",
        entityId: selected.id,
        targetUserId: ownerUser?.id,
        targetUserEmail: ownerUser?.email,
        targetUserName: ownerUser?.name ?? selected.owner,
      });
      if (decision === "approve" && stage === "financial") {
        addNotification({
          id: `not-${Date.now()}-principal`,
          title: "Simulação aguardando aprovação do Gestor",
          description: `${selected.number} passou pelo Financeiro e aguarda decisão do Gestor.`,
          type: "warning",
          createdAt: new Date().toISOString(),
          unread: true,
          entityType: "approval",
          entityId: selected.id,
          targetRole: "Aprovador",
        });
      }
      toast.success(
        decision === "approve"
          ? "Etapa financeira aprovada. A simulação segue para aprovação do Gestor."
          : decision === "adjust"
            ? "Ajuste solicitado. A simulação voltou para o Comercial."
            : "Decisão registrada.",
      );
    }
    setComment("");
    setBankAccount("");
    if (decision !== "approve") setSelectedApprovalId(null);
  }

  if (!canReview) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Central de aprovações"
          description="Acesso restrito a perfis responsáveis por aprovar simulações."
        />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Seu perfil pode consultar as áreas liberadas no menu, mas não pode aprovar, reprovar
              ou solicitar ajuste em simulações.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de aprovações"
        description="Analise simulações em fila e aprove primeiro no financeiro, depois na etapa final."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          label="Aguardando sua ação"
          value={String(pending.length)}
          icon={ClipboardCheck}
          tone="info"
        />
        <StatCard
          label="Valor em análise"
          value={formatCurrency(summary.totalValue)}
          icon={ThumbsUp}
          tone="success"
        />
        <StatCard
          label="Alta prioridade"
          value={String(summary.critical)}
          icon={FileWarning}
          tone="warning"
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden xl:sticky xl:top-24">
          <CardHeader className="border-b border-border">
            <CardTitle>Fila de aprovação</CardTitle>
            <p className="text-sm text-muted-foreground">
              {pending.length} {pending.length === 1 ? "item pendente" : "itens pendentes"}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[560px]">
              <div className="divide-y divide-border">
                {pending.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Sem simulações pendentes para o seu perfil.
                  </p>
                )}
                {pending.map((sim) => {
                  const totals = getSimulationTotals(sim);
                  const active = sim.id === selected?.id;
                  const stage = getCurrentApprovalStage(sim);
                  return (
                    <button
                      key={sim.id}
                      onClick={() => setSelectedApprovalId(sim.id)}
                      aria-pressed={active}
                      className={`relative w-full px-4 py-4 text-left transition-colors before:absolute before:inset-y-0 before:left-0 before:w-0.5 ${active ? "bg-primary-soft/70 before:bg-primary-hover" : "hover:bg-muted/45 before:bg-transparent"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{sim.number}</span>
                        <ViabilityBadge viability={totals.viability} compact />
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{sim.client}</p>
                      <p className="mt-1 text-xs font-medium text-primary">
                        {stage ? APPROVAL_STAGE_LABELS[stage] : "Sem etapa pendente"}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <StatusBadge status={sim.status} />
                        <span className="tabular-nums font-semibold text-foreground">
                          {formatCurrency(totals.revenue)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {selected ? (
          <ApprovalDetails
            simulation={selected}
            comment={comment}
            setComment={setComment}
            bankAccount={bankAccount}
            setBankAccount={setBankAccount}
            onUpdate={updateChecklist}
            onDecide={decide}
          />
        ) : (
          <Card className="grid min-h-80 place-items-center border-dashed p-12">
            <p className="text-muted-foreground">
              Selecione uma simulação na fila para iniciar a análise.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function ApprovalDetails({
  simulation,
  comment,
  setComment,
  bankAccount,
  setBankAccount,
  onUpdate,
  onDecide,
}: {
  simulation: Simulation;
  comment: string;
  setComment: (v: string) => void;
  bankAccount: string;
  setBankAccount: (v: string) => void;
  onUpdate: (key: keyof NonNullable<Simulation["approvalChecklist"]>, value: boolean) => void;
  onDecide: (decision: "approve" | "reject" | "adjust") => void;
}) {
  const totals = getSimulationTotals(simulation);
  const checklist = {
    assumptionsReviewed: false,
    marginValidated: false,
    costsChecked: false,
    notesRegistered: false,
    ...(simulation.approvalChecklist ?? {}),
  };
  const flow = getApprovalFlow(simulation);
  const currentStage = getCurrentApprovalStage(simulation);

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{simulation.number}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {simulation.client} • {simulation.supplier}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={simulation.status} />
            <ViabilityBadge viability={totals.viability} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-labelledby="approval-financial-summary" className="space-y-3">
          <h3
            id="approval-financial-summary"
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            Resumo financeiro
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KV label="Receita" value={formatCurrency(totals.revenue)} />
            <KV label="Custo" value={formatCurrency(totals.merchandiseCost)} />
            <KV label="Despesas" value={formatCurrency(totals.expenses)} />
            <KV label="Lucro líquido" value={formatCurrency(totals.netProfit)} highlight />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <KV label="Margem" value={formatPercent(totals.marginPercent)} highlight />
            <KV label="Condição" value={simulation.paymentCondition} />
            <KV label="Prazo de entrega" value={formatDateTime(simulation.deliveryDate)} />
          </div>
        </section>

        <Separator />

        <div className="grid gap-3 md:grid-cols-2">
          <ApprovalStepCard
            label="Financeiro"
            step={flow.financial}
            active={currentStage === "financial"}
          />
          <ApprovalStepCard
            label="Gestor"
            step={flow.principal}
            active={currentStage === "principal"}
          />
        </div>

        {currentStage === "financial" ? (
          <div className="space-y-2">
            <Label htmlFor="approval-bank-account">Conta bancária de saída</Label>
            <Input
              id="approval-bank-account"
              value={bankAccount}
              onChange={(event) => setBankAccount(event.target.value)}
              placeholder="Informe a conta usada para o pagamento"
            />
          </div>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Checklist da etapa
          </h3>
          <div className="grid gap-2 md:grid-cols-2">
            {CHECKLIST.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background/35 p-3 transition-colors hover:bg-muted/45"
              >
                <Checkbox
                  checked={checklist[item.key]}
                  onCheckedChange={(v) => onUpdate(item.key, Boolean(v))}
                />
                <span className="text-sm">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="approval-internal-comment">Comentário interno</Label>
          <Textarea
            id="approval-internal-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Explique o que o Comercial precisa corrigir antes de reenviar..."
          />
          <p className="text-xs text-muted-foreground">
            Obrigatório ao solicitar ajuste. Esse texto aparecerá para o Comercial na aba Reajustes.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
          <ConfirmDialog
            trigger={
              <Button variant="outline">
                <RotateCcw /> Solicitar ajuste
              </Button>
            }
            title="Solicitar ajuste"
            description="A simulação retornará ao solicitante com o motivo informado."
            actionLabel="Confirmar"
            onConfirm={() => onDecide("adjust")}
          />
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                className="border-danger/30 text-danger hover:bg-danger-soft"
              >
                <X /> Reprovar
              </Button>
            }
            title="Reprovar simulação"
            description="O solicitante será notificado da reprovação."
            actionLabel="Reprovar"
            onConfirm={() => onDecide("reject")}
          />
          <ConfirmDialog
            trigger={
              <Button>
                <Check /> {currentStage === "financial" ? "Aprovar financeiro" : "Aprovar Gestor"}
              </Button>
            }
            title={
              currentStage === "financial" ? "Aprovar etapa financeira" : "Aprovar etapa Gestor"
            }
            description={
              currentStage === "financial"
                ? "A simulação seguirá para a aprovação do Gestor."
                : "A simulação será aprovada e convertida em pedido."
            }
            actionLabel="Aprovar"
            onConfirm={() => onDecide("approve")}
          />
        </div>

        {simulation.approvalNotes ? (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              <strong className="text-foreground">Histórico: </strong>
              {simulation.approvalNotes}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ApprovalStepCard({
  label,
  step,
  active,
}: {
  label: string;
  step: ReturnType<typeof getApprovalFlow>["financial"];
  active: boolean;
}) {
  const statusLabel = {
    pending: "Pendente",
    approved: "Aprovada",
    adjustment_requested: "Ajuste solicitado",
    rejected: "Reprovada",
  }[step.status];

  return (
    <div
      className={`rounded-md border p-3 ${active ? "border-primary-hover/50 bg-primary-soft/70" : "border-border bg-background/35"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{statusLabel}</p>
      {step.approverName ? (
        <p className="mt-1 text-xs text-muted-foreground">Por {step.approverName}</p>
      ) : null}
      {step.decidedAt ? (
        <p className="text-xs text-muted-foreground">{formatDateTime(step.decidedAt)}</p>
      ) : null}
      {step.bankAccount ? (
        <p className="mt-1 text-xs text-muted-foreground">Conta: {step.bankAccount}</p>
      ) : null}
    </div>
  );
}

function KV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/35 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p
        data-metric
        className={`mt-1 tabular-nums ${highlight ? "text-lg font-bold text-foreground" : "font-semibold text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function findSimulationOwnerUser(users: User[], simulation: Simulation) {
  const owner = simulation.owner.trim().toLowerCase();
  return users.find(
    (user) => user.name.trim().toLowerCase() === owner || user.email.trim().toLowerCase() === owner,
  );
}
