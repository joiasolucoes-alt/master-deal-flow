import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthError,
  Session,
  SupabaseClient,
  User as SupabaseUser,
} from "@supabase/supabase-js";
import { SIMULATION_STORAGE_KEY, THEME_STORAGE_KEY, USER_STORAGE_KEY } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { users as seedUsers } from "@/data/users";
import { useAppStore } from "@/store/useAppStore";
import type { Order, Simulation, ThemeMode, User, UserRole, UserStatus } from "@/data/types";
import { getDataProvider, isSupabaseProvider } from "@/lib/dataProvider";
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
  role?: string | null;
  unit_id?: string | null;
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

function getSupabaseLoginErrorMessage(error: AuthError) {
  if (error.code === "email_not_confirmed") {
    return "Seu e-mail ainda não foi confirmado. Confirme pelo link enviado pelo Supabase ou desative a confirmação de e-mail no projeto.";
  }

  if (error.code === "invalid_credentials") {
    return "Credenciais inválidas.";
  }

  return error.message || "Não foi possível autenticar no Supabase.";
}

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

function normalizeDatabaseRole(role?: string | null): string | null {
  const normalized = role?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("gest") || normalized.includes("negocia")) return "gestor";
  if (normalized.includes("aprov")) return "aprovador";
  if (normalized.includes("financ")) return "financeiro";
  if (normalized.includes("comerc")) return "comercial";
  return normalized;
}

function normalizeOrganizationIds(data: unknown): string[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        return row.current_user_organizations ?? row.organization_id ?? row.id;
      }
      return null;
    })
    .filter((item): item is string => typeof item === "string" && item.length > 0);
}

async function resolveMembershipRole(
  client: SupabaseClient,
  organizationId: string,
  profileRole?: string | null,
) {
  const roles = ["admin", "gestor", "aprovador", "financeiro", "comercial"];

  for (const role of roles) {
    const { data, error } = await client.rpc("has_role", {
      _org_id: organizationId,
      _roles: [role],
    });
    if (!error && data === true) return role;
  }

  return normalizeDatabaseRole(profileRole) ?? "comercial";
}

async function loadUserMemberships(
  client: SupabaseClient,
  supabaseUser: SupabaseUser,
  profile: AuthProfile | null,
): Promise<AuthMembership[]> {
  const { data: directMemberships, error: membershipError } = await client
    .from("organization_members")
    .select("id, organization_id, unit_id, user_id, role, organizations(id, name), units(id, name)")
    .eq("user_id", supabaseUser.id);

  if (membershipError) {
    console.warn("Falha ao consultar vínculos diretos do usuário.", membershipError);
  }

  if (directMemberships?.length) {
    return directMemberships as unknown as AuthMembership[];
  }

  const { data: organizationRpcData, error: organizationRpcError } = await client.rpc(
    "current_user_organizations",
  );
  if (organizationRpcError) {
    console.warn("Falha ao consultar organizações via função de segurança.", organizationRpcError);
    return [];
  }

  const organizationIds = normalizeOrganizationIds(organizationRpcData);
  if (!organizationIds.length) return [];

  const [{ data: organizations }, { data: units }] = await Promise.all([
    client.from("organizations").select("id, name").in("id", organizationIds),
    profile?.default_unit_id || profile?.unit_id
      ? client
          .from("units")
          .select("id, name")
          .in("id", [profile.default_unit_id ?? profile.unit_id])
      : Promise.resolve({ data: [] }),
  ]);

  const unit = units?.[0] ? ({ id: units[0].id, name: units[0].name } as AuthMembership["units"]) : null;

  return Promise.all(
    organizationIds.map(async (organizationId) => {
      const organization = organizations?.find((item) => item.id === organizationId) ?? null;
      const role = await resolveMembershipRole(client, organizationId, profile?.role);

      return {
        id: `${organizationId}:${supabaseUser.id}`,
        organization_id: organizationId,
        unit_id: unit?.id ?? null,
        user_id: supabaseUser.id,
        role,
        organizations: organization
          ? { id: organization.id, name: organization.name }
          : { id: organizationId, name: "Master Distribuidora e Logística" },
        units: unit,
      } satisfies AuthMembership;
    }),
  );
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
    const normalized = normalizeDatabaseRole(role);
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
          .select("id, auth_user_id, full_name, name, email, role, unit_id, default_unit_id")
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
            .select("id, auth_user_id, full_name, name, email, role, unit_id, default_unit_id")
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

        const activeMemberships = await loadUserMemberships(
          client,
          supabaseUser,
          profile as AuthProfile | null,
        );
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
    if (!getSupabaseConfigStatus().configured) {
      setAuth((current) => ({ ...current, isLoading: false, accessError: null }));
      return;
    }

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
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password.trim()) {
      return { ok: false, message: "E-mail e senha são obrigatórios." };
    }

    const config = getSupabaseConfigStatus();
    const client = config.configured ? getSupabaseClient() : null;
    let supabaseLoginErrorMessage: string | null = null;

    if (client) {
      setAuth((current) => ({ ...current, isLoading: true, accessError: null }));
      const { data, error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        console.error("Falha no login Supabase.", { code: error.code, status: error.status });
        supabaseLoginErrorMessage = getSupabaseLoginErrorMessage(error);
        clearAuthContext();
      } else if (!data.session) {
        clearAuthContext();
        supabaseLoginErrorMessage = "Não foi possível iniciar uma sessão válida.";
      } else {
        await refreshUserContext(data.session);
        return { ok: true };
      }

      if (isSupabaseProvider()) {
        return { ok: false, message: supabaseLoginErrorMessage ?? "Credenciais inválidas." };
      }
    }

    if (getDataProvider() === "local") {
      const localUser = users.find((user) => user.email.toLowerCase() === normalizedEmail);
      if (!localUser || localUser.password !== password) {
        clearAuthContext();
        return { ok: false, message: supabaseLoginErrorMessage ?? "Credenciais inválidas." };
      }
      if (localUser.status !== "Ativo") {
        clearAuthContext();
        return { ok: false, message: "Usuário sem acesso ativo ao Master Flow." };
      }

      setAuth({
        isAuthenticated: true,
        hasAccess: true,
        isLoading: false,
        session: null,
        supabaseUser: null,
        user: localUser,
        profile: { id: localUser.id, full_name: localUser.name, email: localUser.email },
        memberships: [],
        currentOrganization: null,
        currentUnit: null,
        role: localUser.role,
        accessError: null,
      });
      return { ok: true };
    }

    return { ok: false, message: "Erro de conexão com Supabase." };
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
