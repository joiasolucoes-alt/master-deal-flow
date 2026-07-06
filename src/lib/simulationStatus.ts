import type { Simulation } from "@/data/types";

export function isSimulationAdjustmentRequested(simulation: Simulation) {
  return (
    simulation.status === "Ajuste solicitado" ||
    simulation.approvalFlow?.financial.status === "adjustment_requested" ||
    simulation.approvalFlow?.principal.status === "adjustment_requested"
  );
}

export function getSimulationAdjustmentReason(simulation: Simulation) {
  return (
    simulation.approvalNotes ||
    simulation.approvalFlow?.financial.notes ||
    simulation.approvalFlow?.principal.notes ||
    "Motivo não informado."
  );
}
