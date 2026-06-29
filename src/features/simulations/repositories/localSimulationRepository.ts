import type { Simulation } from "@/data/types";
import type { SimulationRepository } from "@/features/simulations/repositories/simulationRepository";

export function createLocalSimulationRepository(options: {
  getSimulations: () => Simulation[];
  saveSimulation: (simulation: Simulation) => void;
}): SimulationRepository {
  return {
    async list() {
      return options.getSimulations();
    },
    async getById(id: string) {
      return options.getSimulations().find((simulation) => simulation.id === id) ?? null;
    },
    async save(simulation: Simulation) {
      options.saveSimulation(simulation);
      return simulation;
    },
  };
}
