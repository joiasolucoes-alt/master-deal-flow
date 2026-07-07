import type {
  Client,
  DeliveryRecord,
  FinancialTitle,
  FreightRecord,
  Negotiation,
  NegotiationWallet,
  NotificationItem,
  Order,
  Product,
  RealizedResultRecord,
  NegotiationWallet,
  OpportunityPool,
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
  realizedResults: RealizedResultRecord[];
  negotiationWallets: NegotiationWallet[];
  opportunityPools: OpportunityPool[];
  freights: FreightRecord[];
  negotiationWallets: NegotiationWallet[];
  deliveries: DeliveryRecord[];
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  auditEvents: AuditEvent[];
  notifications: NotificationItem[];
  currentUser: User;
  currentUnit: string;
}
