import { orders } from "@/data/orders";
import type { FreightRecord } from "@/data/types";
import { createFreightFromOrder } from "@/features/freights/freightHelpers";

export const freights: FreightRecord[] = orders.map(createFreightFromOrder);
