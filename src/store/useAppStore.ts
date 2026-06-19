import { useSyncExternalStore } from "react";
import { simulationsSeed } from "@/data/simulations";
import { negotiations } from "@/data/negotiations";
import { orders } from "@/data/orders";
import { notifications } from "@/data/notifications";
import { appUser } from "@/data/users";
import type { AuditEvent, AppStoreState } from "@/store/types";
import type { Negotiation, NotificationItem, Order, Simulation } from "@/data/types";

const STORE_KEY = "master-flow-zustand-app-store";
const PENDING_APPROVAL_STATUSES = new Set(["Pendente de aprovação", "Em análise"]);

type Listener = () => void;
export type AppStore = AppStoreState & {
  selectedApprovalId: string | null;
  selectedOrderId: string | null;
  setSimulations: (value: Simulation[]) => void;
  upsertSimulation: (simulation: Simulation, audit?: AuditEvent) => void;
  upsertOrder: (order: Order, audit?: AuditEvent) => void;
  upsertNegotiation: (negotiation: Negotiation) => void;
  addNotification: (notification: NotificationItem) => void;
  setSelectedApprovalId: (id: string | null) => void;
  setSelectedOrderId: (id: string | null) => void;
};

type PersistedState = Omit<
  AppStore,
  | "setSimulations"
  | "upsertSimulation"
  | "upsertOrder"
  | "upsertNegotiation"
  | "addNotification"
  | "setSelectedApprovalId"
  | "setSelectedOrderId"
>;

function baseState(): PersistedState {
  return {
    simulations: simulationsSeed,
    negotiations,
    orders,
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
      window.localStorage.setItem(STORE_KEY, JSON.stringify(initialState));
      return initialState;
    }

    const persisted = mergeSeedSimulations({ ...baseState(), ...JSON.parse(raw) });
    window.localStorage.setItem(STORE_KEY, JSON.stringify(persisted));
    return persisted;
  } catch {
    return baseState();
  }
}

let state: PersistedState = readPersisted();
const listeners = new Set<Listener>();

function persistState() {
  if (typeof window !== "undefined") window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
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
