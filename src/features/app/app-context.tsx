import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AUTH_STORAGE_KEY, SIMULATION_STORAGE_KEY, THEME_STORAGE_KEY } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { appUser } from "@/data/users";
import { useAppStore } from "@/store/useAppStore";
import type { Order, Simulation, ThemeMode, User } from "@/data/types";

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

interface AppContextValue {
  hydrated: boolean;
  auth: AuthState;
  login: () => void;
  logout: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  simulations: Simulation[];
  orders: Order[];
  setSimulations: (value: Simulation[]) => void;
  upsertSimulation: (simulation: Simulation) => void;
  upsertOrder: (order: Order) => void;
  selectedApprovalId: string | null;
  setSelectedApprovalId: (id: string | null) => void;
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const simulations = useAppStore((store) => store.simulations);
  const orders = useAppStore((store) => store.orders);
  const setSimulationsStore = useAppStore((store) => store.setSimulations);
  const upsertSimulationStore = useAppStore((store) => store.upsertSimulation);
  const upsertOrderStore = useAppStore((store) => store.upsertOrder);
  const selectedApprovalId = useAppStore((store) => store.selectedApprovalId);
  const setSelectedApprovalId = useAppStore((store) => store.setSelectedApprovalId);
  const selectedOrderId = useAppStore((store) => store.selectedOrderId);
  const setSelectedOrderId = useAppStore((store) => store.setSelectedOrderId);

  useEffect(() => {
    const storedTheme = getStoredTheme();
    setThemeModeState(storedTheme);
    applyTheme(storedTheme);

    const storedAuth = readLocalStorage<AuthState>(AUTH_STORAGE_KEY, {
      isAuthenticated: false,
      user: null,
    });
    setAuth(storedAuth);

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(themeMode);
    writeLocalStorage(THEME_STORAGE_KEY, themeMode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = () => applyTheme(themeMode);
    media.addEventListener("change", handle);
    return () => media.removeEventListener("change", handle);
  }, [themeMode, hydrated]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    writeLocalStorage(THEME_STORAGE_KEY, mode);
  };

  const login = () => {
    const next = { isAuthenticated: true, user: appUser };
    setAuth(next);
    writeLocalStorage(AUTH_STORAGE_KEY, next);
  };

  const logout = () => {
    const next = { isAuthenticated: false, user: null };
    setAuth(next);
    writeLocalStorage(AUTH_STORAGE_KEY, next);
  };

  const setSimulations = (value: Simulation[]) => {
    setSimulationsStore(value);
    writeLocalStorage(SIMULATION_STORAGE_KEY, value);
  };

  const upsertSimulation = (simulation: Simulation) => {
    upsertSimulationStore(simulation);
  };

  const upsertOrder = (order: Order) => {
    upsertOrderStore(order);
  };

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      auth,
      login,
      logout,
      themeMode,
      setThemeMode,
      simulations,
      orders,
      setSimulations,
      upsertSimulation,
      upsertOrder,
      selectedApprovalId,
      setSelectedApprovalId,
      selectedOrderId,
      setSelectedOrderId,
    }),
    [
      hydrated,
      auth,
      themeMode,
      simulations,
      orders,
      setSimulations,
      upsertSimulation,
      upsertOrder,
      selectedApprovalId,
      setSelectedApprovalId,
      selectedOrderId,
      setSelectedOrderId,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used inside AppProvider");
  return context;
}
