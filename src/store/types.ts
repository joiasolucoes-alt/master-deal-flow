import type {
  Client,
  DeliveryRecord,
  FinancialTitle,
  FreightRecord,
  Negotiation,
  NotificationItem,
  Order,
  Product,
  Simulation,
  Supplier,
  User,
} from "@/data/types";

export type AuditEvent = {
  id: string;
  entityType: "simulation" | "negotiation" | "order";
  entityId: string;
  action: string;
  description: string;
  userId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export interface AppStoreState {
  simulations: Simulation[];
  negotiations: Negotiation[];
  orders: Order[];
  financialTitles: FinancialTitle[];
  freights: FreightRecord[];
  deliveries: DeliveryRecord[];
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  auditEvents: AuditEvent[];
  notifications: NotificationItem[];
  currentUser: User;
  currentUnit: string;
}
