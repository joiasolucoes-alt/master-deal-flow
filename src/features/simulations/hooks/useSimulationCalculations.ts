import { useMemo } from "react";
import type { Simulation } from "@/data/types";
import {
  getSimulationCostImpact,
  getSimulationSensitivity,
  getSimulationTotals,
} from "@/lib/calculations";
export function useSimulationCalculations(simulation: Simulation) {
  const totals = useMemo(() => getSimulationTotals(simulation), [simulation]);
  const costImpact = useMemo(() => getSimulationCostImpact(simulation), [simulation]);
  const sensitivity = useMemo(() => getSimulationSensitivity(simulation), [simulation]);
  return { totals, costImpact, sensitivity };
}
