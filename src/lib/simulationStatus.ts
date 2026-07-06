import type { Simulation } from "@/data/types";

export function isSimulationAdjustmentRequested(simulation: Simulation) {
  return (
    simulation.status === "Ajuste solicitado" ||
    simulation.approvalFlow?.financial.status === "adjustment_requested" ||
    simulation.approvalFlow?.principal.status === "adjustment_requested"
  );
}
