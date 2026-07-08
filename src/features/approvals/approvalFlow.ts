import type {
  ApprovalStage,
  ApprovalStageStatus,
  ApprovalStepState,
  Simulation,
  SimulationApprovalFlow,
  User,
} from "@/data/types";
import { normalizeRole, isSimulationOwner } from "@/lib/permissions";

const pendingStep: ApprovalStepState = { status: "pending" };
const pendingApprovalStatuses = new Set<Simulation["status"]>([
  "Pendente de aprovação",
  "Em análise",
  "Aguardando aprovação do Gestor",
]);

export const APPROVAL_STAGE_LABELS: Record<ApprovalStage, string> = {
  financial: "Financeiro",
  principal: "Gestor",
};

export function getApprovalFlow(simulation: Simulation): SimulationApprovalFlow {
  const inferredApproved = simulation.status === "Aprovada";
  const flow: SimulationApprovalFlow = {
    financial: {
      ...pendingStep,
      ...(inferredApproved ? { status: "approved" as const } : {}),
      ...(simulation.approvalFlow?.financial ?? {}),
    },
    principal: {
      ...pendingStep,
      ...(inferredApproved ? { status: "approved" as const } : {}),
      ...(simulation.approvalFlow?.principal ?? {}),
    },
  };

  if (!pendingApprovalStatuses.has(simulation.status)) {
    return flow;
  }

  const hasStaleAdjustment =
    flow.financial.status === "adjustment_requested" ||
    flow.financial.status === "rejected" ||
    flow.principal.status === "adjustment_requested" ||
    flow.principal.status === "rejected";

  if (!hasStaleAdjustment) return flow;

  return {
    financial: { status: "pending" },
    principal: { status: "pending" },
  };
}

export function getCurrentApprovalStage(simulation: Simulation): ApprovalStage | null {
  if (!pendingApprovalStatuses.has(simulation.status)) {
    return null;
  }

  const flow = getApprovalFlow(simulation);
  if (flow.principal.status === "pending") return "principal";
  return null;
}

export function isFinancialApprovalComplete(simulation: Simulation) {
  return getApprovalFlow(simulation).financial.status === "approved";
}

export function isSimulationFullyApproved(simulation: Simulation) {
  const flow = getApprovalFlow(simulation);
  return flow.financial.status === "approved" && flow.principal.status === "approved";
}

export function canUserDecideApprovalStage(
  user: User | null | undefined,
  simulation: Simulation,
  stage: ApprovalStage | null,
) {
  if (!user || !stage || user.status !== "Ativo") return false;
  const role = normalizeRole(user.role);
  if (role !== "Admin" && isSimulationOwner(user, simulation)) return false;
  if (role === "Admin") return true;
  if (stage === "financial") return role === "Financeiro";
  return role === "Aprovador";
}

export function canConvertApprovedSimulation(simulation: Simulation) {
  return (
    simulation.status === "Aguardando validação comercial" && isSimulationFullyApproved(simulation)
  );
}

export function initializeApprovalFlow(simulation: Simulation): Simulation {
  return {
    ...simulation,
    status: "Aguardando aprovação do Gestor",
    approvalFlow: {
      financial: {
        status: "approved",
        notes: "Etapa financeira movida para pós-aprovação do Gestor.",
      },
      principal: { status: "pending" },
    },
  };
}

export function applyApprovalDecision(
  simulation: Simulation,
  stage: ApprovalStage,
  status: Exclude<ApprovalStageStatus, "pending">,
  payload: {
    approverId?: string;
    approverName?: string;
    notes?: string;
    bankAccount?: string;
    decidedAt?: string;
  },
): Simulation {
  const flow = getApprovalFlow(simulation);
  const decidedAt = payload.decidedAt ?? new Date().toISOString();
  const nextStep: ApprovalStepState = {
    ...flow[stage],
    status,
    approverId: payload.approverId,
    approverName: payload.approverName,
    decidedAt,
    notes: payload.notes,
    bankAccount: payload.bankAccount,
  };
  const nextFlow = { ...flow, [stage]: nextStep };

  if (status === "adjustment_requested") {
    return {
      ...simulation,
      status: "Ajuste solicitado",
      approvalFlow: nextFlow,
      approvalChecklist: undefined,
      approvalNotes: payload.notes || simulation.approvalNotes,
      adjustmentReason: payload.notes || simulation.adjustmentReason || simulation.approvalNotes,
      adjustmentRequestedAt: decidedAt,
      adjustmentRequestedBy: payload.approverName || payload.approverId,
      adjustmentStage: stage,
    };
  }

  if (status === "rejected") {
    return {
      ...simulation,
      status: "Reprovada",
      approvalFlow: nextFlow,
      approvalNotes: payload.notes || simulation.approvalNotes,
      adjustmentReason: undefined,
      adjustmentRequestedAt: undefined,
      adjustmentRequestedBy: undefined,
      adjustmentStage: undefined,
    };
  }

  return {
    ...simulation,
    status:
      nextFlow.financial.status === "approved" && nextFlow.principal.status === "approved"
        ? "Aguardando pagamento"
        : "Aguardando aprovação do Gestor",
    approvalFlow: nextFlow,
    approvalNotes: payload.notes || simulation.approvalNotes,
    paymentRequestedAt:
      nextFlow.financial.status === "approved" && nextFlow.principal.status === "approved"
        ? decidedAt
        : simulation.paymentRequestedAt,
    adjustmentReason: undefined,
    adjustmentRequestedAt: undefined,
    adjustmentRequestedBy: undefined,
    adjustmentStage: undefined,
  };
}
