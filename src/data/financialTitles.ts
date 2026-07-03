import { orders } from "@/data/orders";
import type { FinancialTitle, Order } from "@/data/types";
import { createFinancialTitlesFromOrder } from "@/features/finance/financialTitleHelpers";

export const financialTitles: FinancialTitle[] = orders.flatMap((order: Order) =>
  createFinancialTitlesFromOrder(order),
);
