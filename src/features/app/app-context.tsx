import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AUTH_STORAGE_KEY, SIMULATION_STORAGE_KEY } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { simulationsSeed } from "@/data/simulations";
import { appUser } from "@/data/users";
import type { Simulation, ThemeMode, User } from "@/data/types";

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

interface AppContextValue {
  auth: AuthState;
  login: () => void;
  logout: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  simulations: Simulation[];
  setSimulations: (value: Simulation[]) => void;
  upsertSimulation: (simulation: Simulation) => void;
  selectedApprovalId: string | null;
  setSelectedApprovalId: (id: string | null) => void;
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [simulations, setSimulationsState] = useState<Simulation[]>(simulationsSeed);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(simulationsSeed[0]?.id ?? null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const storedTheme = getStoredTheme();
    setThemeModeState(storedTheme);
    applyTheme(storedTheme);

    const storedAuth = readLocalStorage<AuthState>(AUTH_STORAGE_KEY, {
      isAuthenticated: false,
      user: null,
    });
    setAuth(storedAuth);

    const storedSimulations = readLocalStorage<Simulation[]>(SIMULATION_STORAGE_KEY, simulationsSeed);
    setSimulationsState(storedSimulations);
  }, []);

  useEffect(() => {
    applyTheme(themeMode);
    writeLocalStorage("master-flow-theme", themeMode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = () => applyTheme(themeMode);
    media.addEventListener("change", handle);
    return () => media.removeEventListener("change", handle);
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    writeLocalStorage("master-flow-theme", mode);
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
    setSimulationsState(value);
    writeLocalStorage(SIMULATION_STORAGE_KEY, value);
  };

  const upsertSimulation = (simulation: Simulation) => {
    setSimulationsState((current) => {
      const exists = current.some((item) => item.id === simulation.id);
      const next = exists
        ? current.map((item) => (item.id === simulation.id ? simulation : item))
        : [simulation, ...current];
      writeLocalStorage(SIMULATION_STORAGE_KEY, next);
      return next;
    });
  };

  const value = useMemo<AppContextValue>(
    () => ({
      auth,
      login,
      logout,
      themeMode,
      setThemeMode,
      simulations,
      setSimulations,
      upsertSimulation,
      selectedApprovalId,
      setSelectedApprovalId,
      selectedOrderId,
      setSelectedOrderId,
    }),
    [auth, themeMode, simulations, selectedApprovalId, selectedOrderId],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used inside AppProvider");
  return context;
}
