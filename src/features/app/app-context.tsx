import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { getAppStoreSnapshot, useAppStore } from "@/store/useAppStore";
import type {
  Client,
  DeliveryRecord,
  FinancialTitle,
  FreightRecord,
  Order,
  Product,
  RealizedResultRecord,
  NegotiationWallet,
  OpportunityPool,
  Simulation,
  Supplier,
  ThemeMode,
  User,
  UserRole,
  UserStatus,
} from "@/data/types";
import { getDataProvider, isSupabaseProvider } from "@/lib/dataProvider";
import { getSupabaseClient, getSupabaseConfigStatus } from "@/lib/supabaseClient";
import { createSupabaseSimulationRepository } from "@/features/simulations/repositories/supabaseSimulationRepository";
import { createSupabaseOrderRepository } from "@/features/orders/repositories/supabaseOrderRepository";
import { createSupabaseCatalogRepository } from "@/features/catalogs/repositories/catalogRepository";
import { createSupabaseFinancialRepository } from "@/features/finance/repositories/supabaseFinancialRepository";
import { createSupabaseFreightRepository } from "@/features/freights/repositories/supabaseFreightRepository";
import { createSupabaseDeliveryRepository } from "@/features/deliveries/repositories/supabaseDeliveryRepository";
import { createSupabaseRealizedResultRepository } from "@/features/results/repositories/supabaseRealizedResultRepository";
import { createSupabaseNegotiationWalletRepository } from "@/features/negotiation-wallets/repositories/supabaseNegotiationWalletRepository";
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

type AuthContextPayload = {
  profile: AuthProfile | null;
  memberships: AuthMembership[];
};

type SupabaseAuthContextPayload = {
  profile?: AuthProfile | null;
  memberships?: AuthMembership[] | null;
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
  registerUser: (payload: { email: string; password: string }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  updateCurrentProfile: (payload: { name: string }) => Promise<{ ok: boolean; message?: string }>;
  updateUserAccess: (
    id: string,
    payload: { role?: UserRole; status?: UserStatus },
  ) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  simulations: Simulation[];
  orders: Order[];
  financialTitles: FinancialTitle[];
  realizedResults: RealizedResultRecord[];
  negotiationWallets: NegotiationWallet[];
  opportunityPools: OpportunityPool[];
  freights: FreightRecord[];
  deliveries: DeliveryRecord[];
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  lastDataError: string | null;
  setSimulations: (value: Simulation[]) => void;
  upsertSimulation: (simulation: Simulation) => void;
  upsertOrder: (order: Order) => void;
  upsertFinancialTitle: (title: FinancialTitle) => void;
  upsertRealizedResult: (result: RealizedResultRecord) => void;
  upsertNegotiationWallet: (wallet: NegotiationWallet) => void;
  upsertOpportunityPool: (pool: OpportunityPool) => void;
  upsertFreight: (freight: FreightRecord) => void;
  upsertDelivery: (delivery: DeliveryRecord) => void;
  upsertClient: (client: Client) => void;
  upsertSupplier: (supplier: Supplier) => void;
  upsertProduct: (product: Product) => void;
  selectedApprovalId: string | null;
  setSelectedApprovalId: (id: string | null) => void;
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const BOOTSTRAP_ADMIN_EMAILS = new Set(["djalmajr1994@gmail.com", "gabriellageti@gmail.com"]);
const AUTH_REQUEST_TIMEOUT_MS = 12_000;
const AUTH_LOADING_GUARD_MS = AUTH_REQUEST_TIMEOUT_MS + 3_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATABASE_ROLE_BY_APP_ROLE: Record<UserRole, string> = {
  Comercial: "comercial",
  Negociações: "gestor",
  Aprovador: "aprovador",
  Financeiro: "financeiro",
  Admin: "admin",
};
const DEFAULT_SIGNUP_ROLE = "comercial";

function getInitials(name: string, email: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function getAvatarHue(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return String(hash);
}

function chooseHighestRole(roles: Array<string | null | undefined>) {
  const priority = ["admin", "gestor", "aprovador", "financeiro", "comercial"];
  const normalizedRoles = roles.map(normalizeDatabaseRole).filter(Boolean);

  return priority.find((role) => normalizedRoles.includes(role)) ?? normalizedRoles[0] ?? null;
}

function isDatabaseUuid(value?: string | null) {
  return Boolean(value && UUID_PATTERN.test(value));
}

type TeamProfileRow = AuthProfile & { active?: boolean | null; created_at?: string | null };

async function loadTeamUsersFromSupabase(
  client: SupabaseClient,
  memberships: AuthMembership[],
  mapRole: (role?: string | null) => UserRole,
): Promise<User[]> {
  const organizationIds = Array.from(
    new Set(
      memberships
        .map((membership) => membership.organization_id)
        .filter((organizationId): organizationId is string => isDatabaseUuid(organizationId)),
    ),
  );

  const profilePromise = client
    .from("profiles")
    .select(
      "id, auth_user_id, full_name, name, email, role, unit_id, default_unit_id, active, created_at",
    );

  const membershipPromise = organizationIds.length
    ? client
        .from("organization_members")
        .select(
          "id, organization_id, unit_id, user_id, role, organizations(id, name), units(id, name)",
        )
        .in("organization_id", organizationIds)
    : Promise.resolve({ data: [] as AuthMembership[], error: null });

  const [
    { data: membershipRows, error: membershipError },
    { data: profileRows, error: profileError },
  ] = await Promise.all([membershipPromise, profilePromise]);

  if (membershipError) throw membershipError;
  if (profileError) throw profileError;

  const profilesByAuthId = new Map<string, TeamProfileRow>();
  const profilesById = new Map<string, TeamProfileRow>();

  for (const profile of (profileRows ?? []) as TeamProfileRow[]) {
    if (profile.auth_user_id) profilesByAuthId.set(profile.auth_user_id, profile);
    if (profile.id) profilesById.set(profile.id, profile);
  }

  const usersById = new Map<
    string,
    { profile: TeamProfileRow | null; memberships: AuthMembership[]; fallbackId: string }
  >();

  for (const membership of (membershipRows ?? []) as unknown as AuthMembership[]) {
    const profile =
      profilesByAuthId.get(membership.user_id) ?? profilesById.get(membership.user_id) ?? null;
    const key = profile?.auth_user_id ?? profile?.id ?? membership.user_id;
    const current = usersById.get(key) ?? {
      profile,
      memberships: [],
      fallbackId: membership.user_id,
    };
    current.profile = current.profile ?? profile;
    current.memberships.push(membership);
    usersById.set(key, current);
  }

  for (const profile of (profileRows ?? []) as TeamProfileRow[]) {
    const key = profile.auth_user_id ?? profile.id;
    if (!key || usersById.has(key)) continue;
    usersById.set(key, { profile, memberships: [], fallbackId: key });
  }

  return Array.from(usersById.entries())
    .map(([id, item]) => {
      const profile = item.profile;
      const firstMembership = item.memberships[0];
      const email = profile?.email ?? "";
      const name = profile?.full_name ?? profile?.name ?? (email || "Usuário");
      const databaseRole = chooseHighestRole([
        ...item.memberships.map((membership) => membership.role),
        profile?.role,
      ]);

      return {
        id,
        name,
        role: mapRole(databaseRole),
        email,
        unit: firstMembership?.units?.name ?? "Todas as unidades",
        initials: getInitials(name, email),
        avatarHue: getAvatarHue(email || id),
        status: profile?.active === false ? "Bloqueado" : "Ativo",
        emailConfirmed: true,
        createdAt: profile?.created_at ?? undefined,
      } satisfies User;
    })
    .sort((first, second) => first.name.localeCompare(second.name));
}

function withTimeout<T>(
  promise: PromiseLike<T>,
  message = "A conexão demorou mais que o esperado.",
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

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

const PENDING_APPROVAL_STATUSES = new Set<Simulation["status"]>([
  "Pendente de aprovação",
  "Em análise",
  "Aguardando aprovação do Gestor",
]);

function mergeRemoteSimulationsWithLocalPending(
  remoteSimulations: Simulation[],
  localSimulations: Simulation[],
) {
  const remoteById = new Map(remoteSimulations.map((simulation) => [simulation.id, simulation]));
  const localPending = localSimulations.filter(
    (simulation) =>
      PENDING_APPROVAL_STATUSES.has(simulation.status) &&
      simulation.approvalFlow?.principal.status === "pending",
  );

  if (localPending.length === 0) return remoteSimulations;

  const merged = [...remoteSimulations];
  for (const localSimulation of localPending) {
    const remoteSimulation = remoteById.get(localSimulation.id);
    if (!remoteSimulation) {
      merged.push(localSimulation);
      continue;
    }

    if (!remoteSimulation.approvalFlow && remoteSimulation.status === "Rascunho") {
      const index = merged.findIndex((simulation) => simulation.id === localSimulation.id);
      if (index >= 0) merged[index] = localSimulation;
    }
  }

  return merged;
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

function getBootstrapRole(profile: AuthProfile | null, supabaseUser: SupabaseUser) {
  const role = normalizeDatabaseRole(profile?.role);
  if (role) return role;

  const email = (supabaseUser.email ?? profile?.email ?? "").trim().toLowerCase();
  if (BOOTSTRAP_ADMIN_EMAILS.has(email)) return "admin";

  return null;
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

function normalizeRpcAuthContext(data: unknown): AuthContextPayload | null {
  if (!data || typeof data !== "object") return null;

  const payload = data as SupabaseAuthContextPayload;
  const memberships = Array.isArray(payload.memberships) ? payload.memberships : [];
  return {
    profile: payload.profile ?? null,
    memberships: memberships.filter((item) => item?.organization_id && item?.user_id),
  };
}

async function loadUserContextFromRpc(client: SupabaseClient): Promise<AuthContextPayload | null> {
  const { data, error } = await client.rpc("get_my_master_flow_context");

  if (error) {
    return null;
  }

  return normalizeRpcAuthContext(data);
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

  const { data: profileMemberships, error: profileMembershipError } = profile?.id
    ? await client
        .from("organization_members")
        .select(
          "id, organization_id, unit_id, user_id, role, organizations(id, name), units(id, name)",
        )
        .eq("user_id", profile.id)
    : { data: null, error: null };

  if (profileMembershipError) {
    console.warn("Falha ao consultar vínculos pelo perfil legado.", profileMembershipError);
  }

  if (profileMemberships?.length) {
    return (profileMemberships as unknown as AuthMembership[]).map((membership) => ({
      ...membership,
      user_id: supabaseUser.id,
    }));
  }

  const bootstrapRole = getBootstrapRole(profile, supabaseUser);
  if (bootstrapRole) {
    const unitName =
      profile?.default_unit_id || profile?.unit_id ? "Matriz Cataguases" : "Todas as unidades";

    return [
      {
        id: `bootstrap:${supabaseUser.id}`,
        organization_id: "bootstrap-master-flow",
        unit_id: profile?.default_unit_id ?? profile?.unit_id ?? null,
        user_id: supabaseUser.id,
        role: bootstrapRole,
        organizations: { id: "bootstrap-master-flow", name: "Master Distribuidora e Logística" },
        units: { id: profile?.default_unit_id ?? profile?.unit_id ?? "all", name: unitName },
      },
    ];
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
          .in("id", [(profile.default_unit_id ?? profile.unit_id) as string])
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);

  const unit = units?.[0]
    ? ({ id: units[0].id, name: units[0].name } as AuthMembership["units"])
    : null;

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

async function registerCurrentUserAsCommercial(client: SupabaseClient) {
  const { error } = await client.rpc("register_current_user_as_comercial");
  if (error) throw error;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const authBootstrapStartedRef = useRef(false);
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
  const [lastDataError, setLastDataError] = useState<string | null>(null);
  const simulations = useAppStore((store) => store.simulations);
  const orders = useAppStore((store) => store.orders);
  const financialTitles = useAppStore((store) => store.financialTitles);
  const realizedResults = useAppStore((store) => store.realizedResults);
  const freights = useAppStore((store) => store.freights);
  const deliveries = useAppStore((store) => store.deliveries);
  const clients = useAppStore((store) => store.clients);
  const suppliers = useAppStore((store) => store.suppliers);
  const products = useAppStore((store) => store.products);
  const setSimulationsStore = useAppStore((store) => store.setSimulations);
  const setOrdersStore = useAppStore((store) => store.setOrders);
  const setFinancialTitlesStore = useAppStore((store) => store.setFinancialTitles);
  const setRealizedResultsStore = useAppStore((store) => store.setRealizedResults);
  const setNegotiationWalletsStore = useAppStore((store) => store.setNegotiationWallets);
  const setOpportunityPoolsStore = useAppStore((store) => store.setOpportunityPools);
  const setFreightsStore = useAppStore((store) => store.setFreights);
  const setDeliveriesStore = useAppStore((store) => store.setDeliveries);
  const setClientsStore = useAppStore((store) => store.setClients);
  const setSuppliersStore = useAppStore((store) => store.setSuppliers);
  const setProductsStore = useAppStore((store) => store.setProducts);
  const upsertSimulationStore = useAppStore((store) => store.upsertSimulation);
  const upsertOrderStore = useAppStore((store) => store.upsertOrder);
  const negotiationWallets = useAppStore((store) => store.negotiationWallets);
  const opportunityPools = useAppStore((store) => store.opportunityPools);
  const upsertNegotiationWalletStore = useAppStore((store) => store.upsertNegotiationWallet);
  const upsertOpportunityPoolStore = useAppStore((store) => store.upsertOpportunityPool);
  const upsertFinancialTitleStore = useAppStore((store) => store.upsertFinancialTitle);
  const upsertRealizedResultStore = useAppStore((store) => store.upsertRealizedResult);
  const upsertFreightStore = useAppStore((store) => store.upsertFreight);
  const upsertDeliveryStore = useAppStore((store) => store.upsertDelivery);
  const upsertClientStore = useAppStore((store) => store.upsertClient);
  const upsertSupplierStore = useAppStore((store) => store.upsertSupplier);
  const upsertProductStore = useAppStore((store) => store.upsertProduct);
  const selectedApprovalId = useAppStore((store) => store.selectedApprovalId);
  const setSelectedApprovalId = useAppStore((store) => store.setSelectedApprovalId);
  const selectedOrderId = useAppStore((store) => store.selectedOrderId);
  const setSelectedOrderId = useAppStore((store) => store.setSelectedOrderId);

  useEffect(() => {
    try {
      const storedTheme = getStoredTheme();
      setThemeModeState(storedTheme);
      applyTheme(storedTheme);

      const storedUsers = readLocalStorage<User[]>(USER_STORAGE_KEY, seedUsers).map(
        normalizeStoredUser,
      );
      setUsers(storedUsers);
      writeLocalStorage(USER_STORAGE_KEY, storedUsers);
    } catch (error) {
      console.error("Falha ao inicializar preferências locais.", error);
      toast.error("Falha ao ler dados locais. Iniciando com dados padrão.");
    } finally {
      setHydrated(true);
    }
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
      let session: Session | null = null;
      try {
        session =
          sessionOverride ??
          (
            await withTimeout(
              client.auth.getSession(),
              "Não foi possível recuperar sua sessão. Verifique a conexão e tente novamente.",
            )
          ).data.session;
      } catch (error) {
        console.error("Falha ao recuperar sessão Supabase.", error);
        setAuth((current) => ({
          ...current,
          isLoading: false,
          accessError:
            error instanceof Error ? error.message : "Não foi possível recuperar sua sessão.",
        }));
        return;
      }

      if (!session) {
        clearAuthContext();
        return;
      }

      const supabaseUser = session.user;
      try {
        const rpcContext = await withTimeout(
          loadUserContextFromRpc(client),
          "Não foi possível carregar o contexto do usuário no tempo esperado.",
        );
        let profile = rpcContext?.profile ?? null;

        if (!profile) {
          const { data: loadedProfile, error: profileError } = await withTimeout(
            client
              .from("profiles")
              .select("id, auth_user_id, full_name, name, email, role, unit_id, default_unit_id")
              .eq("auth_user_id", supabaseUser.id)
              .maybeSingle(),
            "Não foi possível carregar o perfil do usuário no tempo esperado.",
          );

          if (profileError) throw new Error("Falha ao carregar perfil do usuário.");

          profile = loadedProfile;

          if (!profile) {
            try {
              await withTimeout(
                registerCurrentUserAsCommercial(client),
                "Não foi possível preparar o perfil Comercial no tempo esperado.",
              );

              const { data: registeredProfile, error: registeredProfileError } = await withTimeout(
                client
                  .from("profiles")
                  .select(
                    "id, auth_user_id, full_name, name, email, role, unit_id, default_unit_id",
                  )
                  .eq("auth_user_id", supabaseUser.id)
                  .maybeSingle(),
                "Não foi possível carregar o perfil Comercial no tempo esperado.",
              );

              if (registeredProfileError) throw registeredProfileError;
              profile = registeredProfile;
            } catch (error) {
              console.warn("Auto cadastro Comercial ainda não está disponível no Supabase.", error);
            }
          }

          if (!profile) {
            const displayName =
              supabaseUser.user_metadata?.full_name ?? supabaseUser.email ?? "Usuário";
            const { data: insertedProfile, error: insertError } = await withTimeout(
              client
                .from("profiles")
                .insert({
                  auth_user_id: supabaseUser.id,
                  full_name: displayName,
                  name: displayName,
                  email: supabaseUser.email,
                  role: "Comercial",
                })
                .select("id, auth_user_id, full_name, name, email, role, unit_id, default_unit_id")
                .maybeSingle(),
              "Não foi possível criar seu perfil no tempo esperado.",
            );

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
        }

        let activeMemberships = rpcContext?.memberships.length
          ? rpcContext.memberships
          : await withTimeout(
              loadUserMemberships(client, supabaseUser, profile as AuthProfile | null),
              "Não foi possível carregar suas permissões no tempo esperado.",
            );

        if (activeMemberships.length === 0) {
          try {
            await withTimeout(
              registerCurrentUserAsCommercial(client),
              "Não foi possível criar o acesso Comercial no tempo esperado.",
            );
            activeMemberships = await withTimeout(
              loadUserMemberships(client, supabaseUser, profile as AuthProfile | null),
              "Não foi possível carregar suas permissões após o cadastro.",
            );
          } catch (error) {
            console.error("Falha ao vincular usuário como Comercial.", error);
          }
        }

        if (
          activeMemberships.some((membership) => normalizeDatabaseRole(membership.role) === "admin")
        ) {
          void loadTeamUsersFromSupabase(client, activeMemberships, mapRole)
            .then((teamUsers) => {
              if (teamUsers.length) setUsers(teamUsers);
            })
            .catch((error) => {
              console.error("Falha ao carregar usuários do Supabase.", error);
              toast.error("Não foi possível carregar a equipe do Supabase.");
            });
        }
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
            : "Seu usuário foi autenticado, mas o acesso Comercial ainda não foi criado. Rode o SQL 014 no Supabase e tente entrar novamente.",
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
    authBootstrapStartedRef.current = true;
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (_event === "INITIAL_SESSION" && authBootstrapStartedRef.current) return;
      window.setTimeout(() => {
        void refreshUserContext(session);
      }, 0);
    });

    return () => subscription.subscription.unsubscribe();
  }, [clearAuthContext, hydrated, refreshUserContext]);

  useEffect(() => {
    if (!hydrated || !auth.isLoading) return;

    const guard = window.setTimeout(() => {
      setAuth((current) => {
        if (!current.isLoading) return current;
        return {
          ...current,
          isLoading: false,
          accessError: "A validação do login demorou mais que o esperado. Saia e entre novamente.",
        };
      });
    }, AUTH_LOADING_GUARD_MS);

    return () => window.clearTimeout(guard);
  }, [auth.isLoading, hydrated]);

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
    const catalogRepository = createSupabaseCatalogRepository();
    const financialRepository = createSupabaseFinancialRepository();
    const realizedResultRepository = createSupabaseRealizedResultRepository();
    const freightRepository = createSupabaseFreightRepository();
    const deliveryRepository = createSupabaseDeliveryRepository();
    const negotiationWalletRepository = createSupabaseNegotiationWalletRepository();

    async function loadRemoteData() {
      try {
        const [
          remoteSimulations,
          remoteOrders,
          remoteFinancialTitles,
          remoteRealizedResults,
          remoteNegotiationWallets,
          remoteOpportunityPools,
          remoteFreights,
          remoteDeliveries,
          remoteClients,
          remoteSuppliers,
          remoteProducts,
        ] = await Promise.all([
          simulationRepository.list(),
          orderRepository.list(),
          financialRepository.listTitles(),
          realizedResultRepository.list(),
          negotiationWalletRepository.listWallets(),
          negotiationWalletRepository.listPools(),
          freightRepository.list(),
          deliveryRepository.list(),
          catalogRepository.listClients(),
          catalogRepository.listSuppliers(),
          catalogRepository.listProducts(),
        ]);

        if (cancelled) return;
        setSimulationsStore(
          mergeRemoteSimulationsWithLocalPending(
            remoteSimulations,
            getAppStoreSnapshot().simulations,
          ),
        );
        setOrdersStore(remoteOrders);
        setFinancialTitlesStore(remoteFinancialTitles);
        setRealizedResultsStore(remoteRealizedResults);
        setNegotiationWalletsStore(remoteNegotiationWallets);
        setOpportunityPoolsStore(remoteOpportunityPools);
        setFreightsStore(remoteFreights);
        setDeliveriesStore(remoteDeliveries);
        setClientsStore(remoteClients);
        setSuppliersStore(remoteSuppliers);
        setProductsStore(remoteProducts);
        setLastDataError(null);
      } catch (error) {
        console.error("Falha ao carregar dados do Supabase.", error);
        setLastDataError(error instanceof Error ? error.message : "Falha ao carregar Supabase.");
        toast.error("Não foi possível carregar o Supabase. Mantive os dados locais.");
      }
    }

    void loadRemoteData();

    return () => {
      cancelled = true;
    };
  }, [
    auth.hasAccess,
    hydrated,
    setClientsStore,
    setDeliveriesStore,
    setFinancialTitlesStore,
    setRealizedResultsStore,
    setNegotiationWalletsStore,
    setOpportunityPoolsStore,
    setFreightsStore,
    setOrdersStore,
    setProductsStore,
    setSimulationsStore,
    setSuppliersStore,
  ]);

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
      let loginResult: Awaited<ReturnType<typeof client.auth.signInWithPassword>>;
      try {
        loginResult = await withTimeout(
          client.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          }),
          "O login demorou mais que o esperado. Verifique a conexão e tente novamente.",
        );
      } catch (error) {
        console.error("Falha no login Supabase.", error);
        clearAuthContext();
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "O login demorou mais que o esperado. Tente novamente.",
        };
      }

      const { data, error } = loginResult;

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

  const registerUser = async (payload: { email: string; password: string }) => {
    const normalizedEmail = payload.email.trim().toLowerCase();
    const password = payload.password.trim();

    if (!normalizedEmail || !password) {
      return { ok: false, message: "E-mail e senha são obrigatórios." };
    }

    if (password.length < 6) {
      return { ok: false, message: "A senha precisa ter pelo menos 6 caracteres." };
    }

    const config = getSupabaseConfigStatus();
    const client = config.configured ? getSupabaseClient() : null;
    if (!client) {
      return { ok: false, message: "Supabase não configurado para criar conta." };
    }

    setAuth((current) => ({ ...current, isLoading: true, accessError: null }));
    const displayName = normalizedEmail.split("@")[0] || "Usuário";

    try {
      const { data, error } = await withTimeout(
        client.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: displayName,
              role: DEFAULT_SIGNUP_ROLE,
            },
          },
        }),
        "O cadastro demorou mais que o esperado. Verifique a conexão e tente novamente.",
      );

      if (error) {
        clearAuthContext();
        return { ok: false, message: error.message || "Não foi possível criar a conta." };
      }

      if (!data.session) {
        clearAuthContext();
        return {
          ok: false,
          message:
            "Conta criada, mas o Supabase está exigindo confirmação de e-mail antes do primeiro acesso.",
        };
      }

      await registerCurrentUserAsCommercial(client);
      await refreshUserContext(data.session);
      return { ok: true };
    } catch (error) {
      console.error("Falha ao cadastrar usuário no Supabase.", error);
      clearAuthContext();
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Não foi possível criar a conta.",
      };
    }
  };

  const updateUserAccess = async (
    id: string,
    payload: { role?: UserRole; status?: UserStatus },
  ) => {
    const targetUser = users.find((user) => user.id === id);
    if (!targetUser) return { ok: false, message: "Usuário não encontrado." };

    const now = new Date().toISOString();
    const client = getSupabaseClient();

    if (
      client &&
      auth.memberships.some((membership) => normalizeDatabaseRole(membership.role) === "admin")
    ) {
      if (payload.role) {
        const organizationIds = Array.from(
          new Set(
            auth.memberships
              .map((membership) => membership.organization_id)
              .filter((organizationId): organizationId is string => isDatabaseUuid(organizationId)),
          ),
        );

        if (organizationIds.length) {
          const databaseRole = DATABASE_ROLE_BY_APP_ROLE[payload.role];

          for (const organizationId of organizationIds) {
            const { data: existingMembership, error: membershipLoadError } = await client
              .from("organization_members")
              .select("id")
              .eq("user_id", id)
              .eq("organization_id", organizationId)
              .maybeSingle();

            if (membershipLoadError) {
              console.error(
                "Falha ao consultar perfil do usuário no Supabase.",
                membershipLoadError,
              );
              return { ok: false, message: "Não foi possível consultar o perfil no Supabase." };
            }

            const membershipResult = existingMembership?.id
              ? await client
                  .from("organization_members")
                  .update({ role: databaseRole, updated_at: now })
                  .eq("id", existingMembership.id)
              : await client.from("organization_members").insert({
                  organization_id: organizationId,
                  user_id: id,
                  role: databaseRole,
                  unit_id: null,
                  updated_at: now,
                });

            if (membershipResult.error) {
              console.error(
                "Falha ao atualizar perfil do usuário no Supabase.",
                membershipResult.error,
              );
              return { ok: false, message: "Não foi possível atualizar o perfil no Supabase." };
            }
          }
        }
      }

      const profileUpdate: Record<string, string | boolean> = { updated_at: now };
      if (payload.role) profileUpdate.role = payload.role;
      if (payload.status) profileUpdate.active = payload.status === "Ativo";

      const { error: profileError } = await client
        .from("profiles")
        .update(profileUpdate)
        .or(`auth_user_id.eq.${id},id.eq.${id}`);

      if (profileError) {
        console.error("Falha ao atualizar cadastro do usuário no Supabase.", profileError);
        return { ok: false, message: "Não foi possível atualizar o cadastro no Supabase." };
      }
    }

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

    if (auth.user?.id === id) {
      await refreshUserContext();
    }

    return { ok: true };
  };

  const updateCurrentProfile = async (payload: { name: string }) => {
    const name = payload.name.trim();
    if (!name) return { ok: false, message: "Informe o nome do perfil." };

    const client = getSupabaseClient();
    const profileId = auth.profile?.id;

    if (client && profileId) {
      const { error } = await client
        .from("profiles")
        .update({ full_name: name, name, updated_at: new Date().toISOString() })
        .eq("id", profileId);

      if (error) {
        console.error("Falha ao atualizar perfil.", error);
        return { ok: false, message: "Não foi possível salvar o perfil agora." };
      }
    }

    setAuth((current) => ({
      ...current,
      user: current.user ? { ...current.user, name } : current.user,
      profile: current.profile ? { ...current.profile, full_name: name, name } : current.profile,
    }));

    return { ok: true };
  };

  const logout = () => {
    const client = getSupabaseClient();
    clearAuthContext();
    void client?.auth.signOut();
  };

  const setSimulations = (value: Simulation[]) => {
    setSimulationsStore(value);
    if (isSupabaseProvider()) return;
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
      setLastDataError(error instanceof Error ? error.message : "Falha ao salvar simulação.");
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
      setLastDataError(error instanceof Error ? error.message : "Falha ao salvar pedido.");
    });
  };

  const upsertNegotiationWallet = (wallet: NegotiationWallet) => {
    upsertNegotiationWalletStore(wallet);
    if (!isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      console.error(
        "VITE_DATA_PROVIDER=supabase, mas VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram configuradas.",
      );
      toast.error("Supabase não configurado. A carteira ficou salva apenas localmente.");
      return;
    }

    const repository = createSupabaseNegotiationWalletRepository();
    void repository.saveWallet(wallet).catch((error) => {
      console.error("Falha ao salvar carteira da negociação no Supabase.", error);
      setLastDataError(error instanceof Error ? error.message : "Falha ao salvar carteira.");
    });
  };

  const upsertOpportunityPool = (pool: OpportunityPool) => {
    upsertOpportunityPoolStore(pool);
    if (!isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      console.error(
        "VITE_DATA_PROVIDER=supabase, mas VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram configuradas.",
      );
      toast.error("Supabase não configurado. O pool ficou salvo apenas localmente.");
      return;
    }

    const repository = createSupabaseNegotiationWalletRepository();
    void repository.savePool(pool).catch((error) => {
      console.error("Falha ao salvar pool de oportunidades no Supabase.", error);
      setLastDataError(error instanceof Error ? error.message : "Falha ao salvar pool.");
    });
  };

  const upsertFinancialTitle = (title: FinancialTitle) => {
    upsertFinancialTitleStore(title);
    if (!isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      console.error(
        "VITE_DATA_PROVIDER=supabase, mas VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram configuradas.",
      );
      toast.error("Supabase não configurado. O financeiro ficou salvo apenas localmente.");
      return;
    }

    const repository = createSupabaseFinancialRepository();
    void repository.saveTitle(title).catch((error) => {
      console.error("Falha ao salvar título financeiro no Supabase.", error);
      setLastDataError(error instanceof Error ? error.message : "Falha ao salvar financeiro.");
    });
  };

  const upsertRealizedResult = (result: RealizedResultRecord) => {
    upsertRealizedResultStore(result);
    if (!isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      console.error(
        "VITE_DATA_PROVIDER=supabase, mas VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram configuradas.",
      );
      toast.error("Supabase não configurado. O fechamento ficou salvo apenas localmente.");
      return;
    }

    const repository = createSupabaseRealizedResultRepository();
    void repository.save(result).catch((error) => {
      console.error("Falha ao salvar resultado realizado no Supabase.", error);
      setLastDataError(
        error instanceof Error ? error.message : "Falha ao salvar resultado realizado.",
      );
    });
  };

  const upsertFreight = (freight: FreightRecord) => {
    upsertFreightStore(freight);
    if (!isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      console.error(
        "VITE_DATA_PROVIDER=supabase, mas VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram configuradas.",
      );
      toast.error("Supabase não configurado. O frete ficou salvo apenas localmente.");
      return;
    }

    const repository = createSupabaseFreightRepository();
    void repository.save(freight).catch((error) => {
      console.error("Falha ao salvar frete no Supabase.", error);
      setLastDataError(error instanceof Error ? error.message : "Falha ao salvar frete.");
    });
  };

  const upsertDelivery = (delivery: DeliveryRecord) => {
    upsertDeliveryStore(delivery);
    if (!isSupabaseProvider()) return;

    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      console.error(
        "VITE_DATA_PROVIDER=supabase, mas VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram configuradas.",
      );
      toast.error("Supabase não configurado. A entrega ficou salva apenas localmente.");
      return;
    }

    const repository = createSupabaseDeliveryRepository();
    void repository.save(delivery).catch((error) => {
      console.error("Falha ao salvar entrega no Supabase.", error);
      setLastDataError(error instanceof Error ? error.message : "Falha ao salvar entrega.");
    });
  };

  const saveCatalogWithSupabase = <T,>(
    label: string,
    action: () => Promise<T>,
    success?: (value: T) => void,
  ) => {
    if (!isSupabaseProvider()) return;
    const config = getSupabaseConfigStatus();
    if (!config.configured) {
      const message = `Supabase não configurado. ${label} ficou salvo apenas localmente.`;
      setLastDataError(message);
      toast.error(message);
      return;
    }

    void action()
      .then((value) => {
        success?.(value);
        setLastDataError(null);
      })
      .catch((error) => {
        console.error(`Falha ao salvar ${label} no Supabase.`, error);
        setLastDataError(error instanceof Error ? error.message : `Falha ao salvar ${label}.`);
      });
  };

  const upsertClient = (client: Client) => {
    upsertClientStore(client);
    const repository = createSupabaseCatalogRepository();
    saveCatalogWithSupabase("cliente", () => repository.saveClient(client), upsertClientStore);
  };

  const upsertSupplier = (supplier: Supplier) => {
    upsertSupplierStore(supplier);
    const repository = createSupabaseCatalogRepository();
    saveCatalogWithSupabase(
      "fornecedor",
      () => repository.saveSupplier(supplier),
      upsertSupplierStore,
    );
  };

  const upsertProduct = (product: Product) => {
    upsertProductStore(product);
    const repository = createSupabaseCatalogRepository();
    saveCatalogWithSupabase("produto", () => repository.saveProduct(product), upsertProductStore);
  };

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      auth,
      users,
      login,
      registerUser,
      updateCurrentProfile,
      refreshUserContext,
      updateUserAccess,
      logout,
      themeMode,
      setThemeMode,
      simulations,
      orders,
      financialTitles,
      realizedResults,
      negotiationWallets,
      opportunityPools,
      freights,
      deliveries,
      clients,
      suppliers,
      products,
      lastDataError,
      setSimulations,
      upsertSimulation,
      upsertOrder,
      upsertFinancialTitle,
      upsertRealizedResult,
      upsertNegotiationWallet,
      upsertOpportunityPool,
      upsertFreight,
      upsertDelivery,
      upsertClient,
      upsertSupplier,
      upsertProduct,
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
      financialTitles,
      realizedResults,
      negotiationWallets,
      opportunityPools,
      freights,
      deliveries,
      clients,
      suppliers,
      products,
      lastDataError,
      setSimulations,
      upsertSimulation,
      upsertOrder,
      upsertFinancialTitle,
      upsertRealizedResult,
      upsertNegotiationWallet,
      upsertOpportunityPool,
      upsertFreight,
      upsertDelivery,
      upsertClient,
      upsertSupplier,
      upsertProduct,
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
