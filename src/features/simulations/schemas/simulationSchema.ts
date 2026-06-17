import { z } from "zod";
export const simulationMinimumSchema = z.object({
  client: z.string().min(1),
  supplier: z.string().min(1),
});
