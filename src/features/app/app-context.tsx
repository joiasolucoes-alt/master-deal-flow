import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { SIMULATION_STORAGE_KEY, THEME_STORAGE_KEY, USER_STORAGE_KEY } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { users as seedUsers } from "@/data/users";
import { useAppStore } from "@/store/useAppStore";
import type { Order, Simulation, ThemeMode, User, UserRole, UserStatus } from "@/data/types";
import { isSupabaseProvider } from "@/lib/dataProvider";
import { getSupabaseClient, getSupabaseConfigStatus } from "@/lib/supabaseClient";
import { createSupabaseSimulationRepository } from "@/features/simulations/repositories/supabaseSimulationRepository";
import { createSupabaseOrderRepository } from "@/features/orders/repositories/supabaseOrderRepository";
import { toast } from "sonner";

type AuthProfile = {
  id?: string;
  auth_user_id?: string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  default_unit_id?: string | null;
};

type AuthMembership = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  user_id: string;
  role: string;
  organizations?: { id: string; name: string } | null;
  units?: { id: string; name: string } | null;
};

interface AuthState {
  isAuthenticated: boolean;
  hasAccess: boolean;
  isLoading: boolean;
  session: Session | null;
  supabaseUser: SupabaseUser | null;
  user: User | null;
  profile: AuthProfile | null;
  memberships: AuthMembership[];
  currentOrganization: AuthMembership["organizations"] | null;
  currentUnit: AuthMembership["units"] | null;
  role: string | null;
  accessError: string | null;
}

interface AppContextValue {
  hydrated: boolean;
  auth: AuthState;
  users: User[];
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  refreshUserContext: (session?: Session | null) => Promise<void>;
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
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    hasAccess: false,
    isLoading: true,
    session: null,
    supabaseUser: null,
    user: null,
    profile: null,
    memberships: [],
    currentOrganization: null,
    currentUnit: null,
    role: null,
    accessError: null,
  });
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

    setHydrated(true);
  }, []);

  const clearAuthContext = useCallback(() => {
    setAuth((current) => ({
      ...current,
      isAuthenticated: false,
      hasAccess: false,
      isLoading: false,
      session: null,
      supabaseUser: null,
      user: null,
      profile: null,
      memberships: [],
      currentOrganization: null,
      currentUnit: null,
      role: null,
      accessError: null,
    }));
  }, []);

  const mapRole = (role?: string | null): UserRole => {
    const normalized = role?.toLowerCase();
    if (normalized === "admin") return "Admin";
    if (normalized === "gestor") return "Negociações";
    if (normalized === "aprovador") return "Aprovador";
    if (normalized === "financeiro") return "Financeiro";
    return "Comercial";
  };

  const refreshUserContext = useCallback(
    async (sessionOverride?: Session | null) => {
      const client = getSupabaseClient();
      if (!client) {
        setAuth((current) => ({
          ...current,
          isLoading: false,
          accessError: "Erro de conexão com Supabase.",
        }));
        return;
      }

      setAuth((current) => ({ ...current, isLoading: true, accessError: null }));
      const session = sessionOverride ?? (await client.auth.getSession()).data.session;
      if (!session) {
        clearAuthContext();
        return;
      }

      const supabaseUser = session.user;
      try {
        const { data: loadedProfile, error: profileError } = await client
          .from("profiles")
          .select("id, auth_user_id, full_name, name, email, default_unit_id")
          .eq("auth_user_id", supabaseUser.id)
          .maybeSingle();

        if (profileError) throw new Error("Falha ao carregar perfil do usuário.");

        let profile = loadedProfile;

        if (!profile) {
          const { data: insertedProfile, error: insertError } = await client
            .from("profiles")
            .insert({
              auth_user_id: supabaseUser.id,
              full_name: supabaseUser.user_metadata?.full_name ?? supabaseUser.email ?? "Usuário",
              email: supabaseUser.email,
            })
            .select("id, auth_user_id, full_name, name, email, default_unit_id")
            .maybeSingle();

          if (insertError) {
            setAuth((current) => ({
              ...current,
              isAuthenticated: true,
              hasAccess: false,
              isLoading: false,
              session,
              supabaseUser,
              accessError:
                "Seu usuário foi autenticado, mas ainda não possui perfil no Master Flow. Solicite liberação ao administrador.",
            }));
            return;
          }
          profile = insertedProfile;
        }

        const { data: memberships, error: membershipError } = await client
          .from("organization_members")
          .select(
            "id, organization_id, unit_id, user_id, role, organizations(id, name), units(id, name)",
          )
          .eq("user_id", supabaseUser.id);

        if (membershipError) throw new Error("Usuário autenticado, mas sem acesso ao Master Flow.");

        const activeMemberships = (memberships ?? []) as unknown as AuthMembership[];
        const currentMembership = activeMemberships[0] ?? null;
        const role = currentMembership?.role ?? null;
        const displayName = profile?.full_name ?? profile?.name ?? supabaseUser.email ?? "Usuário";
        const unitName = currentMembership?.units?.name ?? "Sem unidade";
        const appAuthUser: User = {
          id: supabaseUser.id,
          name: displayName,
          email: supabaseUser.email ?? profile?.email ?? "",
          role: mapRole(role),
          unit: unitName,
          initials:
            displayName
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part: string) => part[0]?.toUpperCase())
              .join("") || "MF",
          avatarHue: "from-info to-primary",
          status: currentMembership ? "Ativo" : "Pendente",
          emailConfirmed: Boolean(supabaseUser.email_confirmed_at),
        };

        setAuth({
          isAuthenticated: true,
          hasAccess: activeMemberships.length > 0,
          isLoading: false,
          session,
          supabaseUser,
          user: appAuthUser,
          profile: profile as AuthProfile | null,
          memberships: activeMemberships,
          currentOrganization: currentMembership?.organizations ?? null,
          currentUnit: currentMembership?.units ?? null,
          role,
          accessError: activeMemberships.length
            ? null
            : "Seu usuário foi autenticado, mas ainda não possui acesso a nenhuma organização no Master Flow.",
        });
      } catch (error) {
        console.error("Falha ao carregar contexto de autenticação.", error);
        setAuth((current) => ({
          ...current,
          isAuthenticated: true,
          hasAccess: false,
          isLoading: false,
          session,
          supabaseUser,
          accessError:
            error instanceof Error ? error.message : "Falha ao carregar perfil do usuário.",
        }));
      }
    },
    [clearAuthContext],
  );

  useEffect(() => {
    if (!hydrated) return;
    const client = getSupabaseClient();
    if (!client) {
      clearAuthContext();
      return;
    }

    void refreshUserContext();
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      void refreshUserContext(session);
    });

    return () => subscription.subscription.unsubscribe();
  }, [clearAuthContext, hydrated, refreshUserContext]);

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
    if (!hydrated || !auth.hasAccess || !isSupabaseProvider()) return;

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
  }, [auth.hasAccess, hydrated, setOrdersStore, setSimulationsStore]);

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
      return updatedCurrentUser ? { ...current, user: updatedCurrentUser } : current;
    });
  };

  const login = async (email: string, password: string) => {
    const client = getSupabaseClient();
    if (!email.trim() || !password.trim()) {
      return { ok: false, message: "E-mail e senha são obrigatórios." };
    }
    if (!client) return { ok: false, message: "Erro de conexão com Supabase." };

    setAuth((current) => ({ ...current, isLoading: true, accessError: null }));
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      console.error("Falha no login Supabase.", { code: error.code, status: error.status });
      clearAuthContext();
      return { ok: false, message: "Credenciais inválidas." };
    }

    if (!data.session) {
      clearAuthContext();
      return { ok: false, message: "Não foi possível iniciar uma sessão válida." };
    }

    await refreshUserContext(data.session);
    return { ok: true };
  };

  const registerUser = (_payload: { name: string; email: string; password: string }) => ({
    ok: false,
    message:
      "Cadastro local desativado. Solicite a criação do usuário no Supabase Auth ao administrador.",
  });

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
    const client = getSupabaseClient();
    clearAuthContext();
    void client?.auth.signOut();
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
      refreshUserContext,
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
