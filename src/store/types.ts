import type { Negotiation, NotificationItem, Order, Simulation, User } from "@/data/types";

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
  auditEvents: AuditEvent[];
  notifications: NotificationItem[];
  currentUser: User;
  currentUnit: string;
}
