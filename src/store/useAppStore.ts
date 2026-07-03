import { useSyncExternalStore } from "react";
import { simulationsSeed } from "@/data/simulations";
import { negotiations } from "@/data/negotiations";
import { orders } from "@/data/orders";
import { financialTitles } from "@/data/financialTitles";
import { freights } from "@/data/freights";
import { deliveries } from "@/data/deliveries";
import { notifications } from "@/data/notifications";
import { appUser } from "@/data/users";
import { clients } from "@/data/clients";
import { suppliers } from "@/data/suppliers";
import { products } from "@/data/products";
import type { AuditEvent, AppStoreState } from "@/store/types";
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
} from "@/data/types";

const STORE_KEY = "master-flow-zustand-app-store";
const PENDING_APPROVAL_STATUSES = new Set(["Pendente de aprovação", "Em análise"]);

type Listener = () => void;
export type AppStore = AppStoreState & {
  selectedApprovalId: string | null;
  selectedOrderId: string | null;
  setSimulations: (value: Simulation[]) => void;
  setOrders: (value: Order[]) => void;
  setFinancialTitles: (value: FinancialTitle[]) => void;
  setFreights: (value: FreightRecord[]) => void;
  setDeliveries: (value: DeliveryRecord[]) => void;
  setClients: (value: Client[]) => void;
  setSuppliers: (value: Supplier[]) => void;
  setProducts: (value: Product[]) => void;
  upsertSimulation: (simulation: Simulation, audit?: AuditEvent) => void;
  upsertOrder: (order: Order, audit?: AuditEvent) => void;
  upsertFinancialTitle: (title: FinancialTitle, audit?: AuditEvent) => void;
  upsertFreight: (freight: FreightRecord, audit?: AuditEvent) => void;
  upsertDelivery: (delivery: DeliveryRecord, audit?: AuditEvent) => void;
  upsertClient: (client: Client) => void;
  upsertSupplier: (supplier: Supplier) => void;
  upsertProduct: (product: Product) => void;
  upsertNegotiation: (negotiation: Negotiation) => void;
  addNotification: (notification: NotificationItem) => void;
  markNotificationRead: (id: string) => void;
  setSelectedApprovalId: (id: string | null) => void;
  setSelectedOrderId: (id: string | null) => void;
};

type PersistedState = Omit<
  AppStore,
  | "setSimulations"
  | "setOrders"
  | "setFinancialTitles"
  | "setFreights"
  | "setDeliveries"
  | "setClients"
  | "setSuppliers"
  | "setProducts"
  | "upsertSimulation"
  | "upsertOrder"
  | "upsertFinancialTitle"
  | "upsertFreight"
  | "upsertDelivery"
  | "upsertClient"
  | "upsertSupplier"
  | "upsertProduct"
  | "upsertNegotiation"
  | "addNotification"
  | "markNotificationRead"
  | "setSelectedApprovalId"
  | "setSelectedOrderId"
>;

function baseState(): PersistedState {
  return {
    simulations: simulationsSeed,
    negotiations,
    orders,
    financialTitles,
    freights,
    deliveries,
    clients,
    suppliers,
    products,
    auditEvents: [],
    notifications,
    currentUser: appUser,
    currentUnit: appUser.unit,
    selectedApprovalId:
      simulationsSeed.find((s) => PENDING_APPROVAL_STATUSES.has(s.status))?.id ?? null,
    selectedOrderId: orders[0]?.id ?? null,
  };
}

function mergeSeedSimulations(persisted: PersistedState): PersistedState {
  const existingIds = new Set(persisted.simulations.map((simulation) => simulation.id));
  const missingSeeds = simulationsSeed.filter((simulation) => !existingIds.has(simulation.id));

  if (missingSeeds.length === 0) return persisted;

  return {
    ...persisted,
    simulations: [...missingSeeds, ...persisted.simulations],
    selectedApprovalId:
      persisted.selectedApprovalId ??
      missingSeeds.find((simulation) => PENDING_APPROVAL_STATUSES.has(simulation.status))?.id ??
      null,
  };
}

function readPersisted(): PersistedState {
  if (typeof window === "undefined") return baseState();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) {
      const initialState = baseState();
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(initialState));
      } catch (error) {
        console.warn("Falha ao inicializar estado global no armazenamento local.", error);
      }
      return initialState;
    }

    const persisted = mergeSeedSimulations({ ...baseState(), ...JSON.parse(raw) });
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(persisted));
    } catch (error) {
      console.warn("Falha ao atualizar estado global no armazenamento local.", error);
    }
    return persisted;
  } catch {
    return baseState();
  }
}

let state: PersistedState = readPersisted();
const listeners = new Set<Listener>();

function persistState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Falha ao gravar estado global no armazenamento local.", error);
  }
}

function setState(updater: (current: PersistedState) => PersistedState) {
  state = updater(state);
  snapshot = { ...state, ...storeActions };
  persistState();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const storeActions = {
  setSimulations: (value: Simulation[]) =>
    setState((current) => ({ ...current, simulations: value })),
  setOrders: (value: Order[]) => setState((current) => ({ ...current, orders: value })),
  setFinancialTitles: (value: FinancialTitle[]) =>
    setState((current) => ({ ...current, financialTitles: value })),
  setFreights: (value: FreightRecord[]) => setState((current) => ({ ...current, freights: value })),
  setDeliveries: (value: DeliveryRecord[]) =>
    setState((current) => ({ ...current, deliveries: value })),
  setClients: (value: Client[]) => setState((current) => ({ ...current, clients: value })),
  setSuppliers: (value: Supplier[]) => setState((current) => ({ ...current, suppliers: value })),
  setProducts: (value: Product[]) => setState((current) => ({ ...current, products: value })),
  upsertSimulation: (simulation: Simulation, audit?: AuditEvent) =>
    setState((current) => ({
      ...current,
      simulations: current.simulations.some((item) => item.id === simulation.id)
        ? current.simulations.map((item) => (item.id === simulation.id ? simulation : item))
        : [simulation, ...current.simulations],
      auditEvents: audit ? [audit, ...current.auditEvents] : current.auditEvents,
    })),
  upsertOrder: (order: Order, audit?: AuditEvent) =>
    setState((current) => ({
      ...current,
      orders: current.orders.some((item) => item.id === order.id)
        ? current.orders.map((item) => (item.id === order.id ? order : item))
        : [order, ...current.orders],
      auditEvents: audit ? [audit, ...current.auditEvents] : current.auditEvents,
    })),
  upsertFinancialTitle: (title: FinancialTitle, audit?: AuditEvent) =>
    setState((current) => ({
      ...current,
      financialTitles: current.financialTitles.some((item) => item.id === title.id)
        ? current.financialTitles.map((item) => (item.id === title.id ? title : item))
        : [title, ...current.financialTitles],
      auditEvents: audit ? [audit, ...current.auditEvents] : current.auditEvents,
    })),
  upsertFreight: (freight: FreightRecord, audit?: AuditEvent) =>
    setState((current) => ({
      ...current,
      freights: current.freights.some((item) => item.id === freight.id)
        ? current.freights.map((item) => (item.id === freight.id ? freight : item))
        : [freight, ...current.freights],
      auditEvents: audit ? [audit, ...current.auditEvents] : current.auditEvents,
    })),
  upsertDelivery: (delivery: DeliveryRecord, audit?: AuditEvent) =>
    setState((current) => ({
      ...current,
      deliveries: current.deliveries.some((item) => item.id === delivery.id)
        ? current.deliveries.map((item) => (item.id === delivery.id ? delivery : item))
        : [delivery, ...current.deliveries],
      auditEvents: audit ? [audit, ...current.auditEvents] : current.auditEvents,
    })),
  upsertClient: (client: Client) =>
    setState((current) => ({
      ...current,
      clients: current.clients.some((item) => item.id === client.id)
        ? current.clients.map((item) => (item.id === client.id ? client : item))
        : [client, ...current.clients],
    })),
  upsertSupplier: (supplier: Supplier) =>
    setState((current) => ({
      ...current,
      suppliers: current.suppliers.some((item) => item.id === supplier.id)
        ? current.suppliers.map((item) => (item.id === supplier.id ? supplier : item))
        : [supplier, ...current.suppliers],
    })),
  upsertProduct: (product: Product) =>
    setState((current) => ({
      ...current,
      products: current.products.some((item) => item.id === product.id)
        ? current.products.map((item) => (item.id === product.id ? product : item))
        : [product, ...current.products],
    })),
  upsertNegotiation: (negotiation: Negotiation) =>
    setState((current) => ({
      ...current,
      negotiations: current.negotiations.some((item) => item.id === negotiation.id)
        ? current.negotiations.map((item) => (item.id === negotiation.id ? negotiation : item))
        : [negotiation, ...current.negotiations],
    })),
  addNotification: (notification: NotificationItem) =>
    setState((current) => ({
      ...current,
      notifications: [notification, ...current.notifications],
    })),
  markNotificationRead: (id: string) =>
    setState((current) => ({
      ...current,
      notifications: current.notifications.map((notification) =>
        notification.id === id ? { ...notification, unread: false } : notification,
      ),
    })),
  setSelectedApprovalId: (id: string | null) =>
    setState((current) => ({ ...current, selectedApprovalId: id })),
  setSelectedOrderId: (id: string | null) =>
    setState((current) => ({ ...current, selectedOrderId: id })),
};

let snapshot: AppStore = { ...state, ...storeActions };

export function getAppStoreSnapshot(): AppStore {
  return snapshot;
}

export function useAppStore<T>(selector: (snapshot: AppStore) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(snapshot),
    () => selector(snapshot),
  );
}
