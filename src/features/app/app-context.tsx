import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AUTH_STORAGE_KEY,
  SIMULATION_STORAGE_KEY,
  THEME_STORAGE_KEY,
  USER_STORAGE_KEY,
} from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { users as seedUsers } from "@/data/users";
import { useAppStore } from "@/store/useAppStore";
import type { Order, Simulation, ThemeMode, User, UserRole, UserStatus } from "@/data/types";
import { isSupabaseProvider } from "@/lib/dataProvider";
import { getSupabaseConfigStatus } from "@/lib/supabaseClient";
import { createSupabaseSimulationRepository } from "@/features/simulations/repositories/supabaseSimulationRepository";
import { createSupabaseOrderRepository } from "@/features/orders/repositories/supabaseOrderRepository";
import { toast } from "sonner";

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

interface AppContextValue {
  hydrated: boolean;
  auth: AuthState;
  users: User[];
  login: (email: string, password: string) => { ok: boolean; message?: string };
  registerUser: (payload: { name: string; email: string; password: string }) => {
    ok: boolean;
    message: string;
  };
  updateUserAccess: (id: string, payload: { role?: UserRole; status?: UserStatus }) => void;
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

function normalizeStoredUser(user: User): User {
  const isSeedAdmin = user.id === "user-admin";
  return {
    ...user,
    email: isSeedAdmin ? "admin@masterflow.com.br" : user.email,
    password: user.password ?? (isSeedAdmin ? "admin" : "masterflow"),
    status: user.status === "Pendente" ? "Ativo" : (user.status ?? "Ativo"),
    emailConfirmed: user.emailConfirmed ?? true,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [users, setUsers] = useState<User[]>(seedUsers);
  const simulations = useAppStore((store) => store.simulations);
  const orders = useAppStore((store) => store.orders);
  const setSimulationsStore = useAppStore((store) => store.setSimulations);
  const setOrdersStore = useAppStore((store) => store.setOrders);
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

    const storedUsers = readLocalStorage<User[]>(USER_STORAGE_KEY, seedUsers).map(
      normalizeStoredUser,
    );
    setUsers(storedUsers);
    writeLocalStorage(USER_STORAGE_KEY, storedUsers);

    const storedAuth = readLocalStorage<AuthState>(AUTH_STORAGE_KEY, {
      isAuthenticated: false,
      user: null,
    });
    const currentUser = storedAuth.user
      ? (storedUsers.find((user) => user.id === storedAuth.user?.id) ??
        normalizeStoredUser(storedAuth.user))
      : null;
    setAuth({ ...storedAuth, user: currentUser });

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

  useEffect(() => {
    if (!hydrated || !isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      toast.error("Supabase não configurado. Usando dados locais por enquanto.");
      return;
    }

    let cancelled = false;
    const simulationRepository = createSupabaseSimulationRepository();
    const orderRepository = createSupabaseOrderRepository();

    async function loadRemoteData() {
      try {
        const [remoteSimulations, remoteOrders] = await Promise.all([
          simulationRepository.list(),
          orderRepository.list(),
        ]);

        if (cancelled) return;
        setSimulationsStore(remoteSimulations);
        setOrdersStore(remoteOrders);
      } catch (error) {
        console.error("Falha ao carregar dados do Supabase.", error);
        toast.error("Não foi possível carregar o Supabase. Mantive os dados locais.");
      }
    }

    void loadRemoteData();

    return () => {
      cancelled = true;
    };
  }, [hydrated, setOrdersStore, setSimulationsStore]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    writeLocalStorage(THEME_STORAGE_KEY, mode);
  };

  const persistUsers = (nextUsers: User[]) => {
    setUsers(nextUsers);
    writeLocalStorage(USER_STORAGE_KEY, nextUsers);

    setAuth((current) => {
      if (!current.user) return current;
      const updatedCurrentUser = nextUsers.find((user) => user.id === current.user?.id);
      if (!updatedCurrentUser) return current;
      const nextAuth = { ...current, user: updatedCurrentUser };
      writeLocalStorage(AUTH_STORAGE_KEY, nextAuth);
      return nextAuth;
    });
  };

  const login = (email: string, password: string) => {
    const selectedUser = users.find(
      (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
    );

    if (!selectedUser) {
      return {
        ok: false,
        message: "E-mail não encontrado. Cadastre-se ou confira o endereço informado.",
      };
    }

    if ((selectedUser.password ?? "masterflow") !== password) {
      return {
        ok: false,
        message: "Senha incorreta.",
      };
    }

    if (selectedUser.status === "Bloqueado") {
      return {
        ok: false,
        message: "Usuário bloqueado. Procure o admin do sistema.",
      };
    }

    const next = { isAuthenticated: true, user: selectedUser };
    setAuth(next);
    writeLocalStorage(AUTH_STORAGE_KEY, next);
    return { ok: true };
  };

  const registerUser = (payload: { name: string; email: string; password: string }) => {
    const email = payload.email.trim().toLowerCase();
    if (users.some((user) => user.email.toLowerCase() === email)) {
      return {
        ok: false,
        message: "Este e-mail já está cadastrado no sistema.",
      };
    }

    const name = payload.name.trim();
    const initials = name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
    const newUser: User = {
      id: `user-${Date.now()}`,
      name,
      role: "Comercial",
      email,
      password: payload.password,
      unit: "Sem unidade",
      initials: initials || "NU",
      avatarHue: "from-info to-primary",
      status: "Ativo",
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
    };

    persistUsers([...users, newUser]);
    const nextAuth = { isAuthenticated: true, user: newUser };
    setAuth(nextAuth);
    writeLocalStorage(AUTH_STORAGE_KEY, nextAuth);

    return {
      ok: true,
      message: "Conta criada com sucesso. Você já pode acessar o sistema.",
    };
  };

  const updateUserAccess = (id: string, payload: { role?: UserRole; status?: UserStatus }) => {
    const now = new Date().toISOString();
    const nextUsers = users.map((user) => {
      if (user.id !== id) return user;
      const nextStatus = payload.status ?? user.status;
      return {
        ...user,
        role: payload.role ?? user.role,
        status: nextStatus,
        emailConfirmed: nextStatus === "Ativo" ? true : user.emailConfirmed,
        approvedAt: nextStatus === "Ativo" && user.status !== "Ativo" ? now : user.approvedAt,
      };
    });
    persistUsers(nextUsers);
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
    if (!isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      console.error(
        "VITE_DATA_PROVIDER=supabase, mas VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram configuradas.",
      );
      toast.error("Supabase não configurado. A simulação ficou salva apenas localmente.");
      return;
    }

    const repository = createSupabaseSimulationRepository();
    void repository.save(simulation).catch((error) => {
      console.error("Falha ao salvar simulação no Supabase.", error);
      toast.error("Falha ao salvar simulação no Supabase. Dados locais preservados.");
    });
  };

  const upsertOrder = (order: Order) => {
    upsertOrderStore(order);
    if (!isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      console.error(
        "VITE_DATA_PROVIDER=supabase, mas VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram configuradas.",
      );
      toast.error("Supabase não configurado. O pedido ficou salvo apenas localmente.");
      return;
    }

    const repository = createSupabaseOrderRepository();
    void repository.save(order).catch((error) => {
      console.error("Falha ao salvar pedido no Supabase.", error);
      toast.error("Falha ao salvar pedido no Supabase. Dados locais preservados.");
    });
  };

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      auth,
      users,
      login,
      registerUser,
      updateUserAccess,
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
      users,
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
