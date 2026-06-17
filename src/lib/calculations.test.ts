import { describe, expect, it } from "vitest";
import { getSimulationTotals } from "./calculations";
import type { Simulation } from "@/data/types";

const simulation = {
  products: [
    {
      id: "p",
      code: "P",
      product: "Produto",
      boxes: 2,
      unitsPerBox: 10,
      quantityTotal: 20,
      costUnit: 70,
      saleUnit: 100,
    },
  ],
  expenseItems: [{ id: "e", type: "Frete", calculationType: "fixed", value: 200 }],
} as Pick<Simulation, "products" | "expenseItems">;

describe("simulation calculations", () => {
  it("calcula quantidade, custo, receita, lucros, margem e viabilidade", () => {
    const totals = getSimulationTotals(simulation);
    expect(simulation.products[0].quantityTotal).toBe(20);
    expect(totals.merchandiseCost).toBe(1400);
    expect(totals.revenue).toBe(2000);
    expect(totals.grossProfit).toBe(600);
    expect(totals.netProfit).toBe(400);
    expect(totals.marginPercent).toBe(20);
    expect(totals.viability).toBe("Viável");
  });
});
