import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/app/page-header";
import { ProgressStepper } from "@/components/app/progress-stepper";
import { StatusBadge } from "@/components/app/status-badge";
import { ViabilityBadge } from "@/components/app/viability-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";
import { useAppContext } from "@/features/app/app-context";
import { createWalletFromSimulationOrder } from "@/features/negotiation-wallets";
import { businessUnits } from "@/data/users";
import type {
  Client,
  ExpenseItem,
  PurchaseItem,
  Simulation,
  SimulationProduct,
  Supplier,
  User,
} from "@/data/types";
import {
  getExpenseTotal,
  getProductCostTotal,
  getProductSaleTotal,
  getPurchaseShare,
  getSimulationCostImpact,
  getSimulationSensitivity,
  getSimulationTotals,
} from "@/lib/calculations";
import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import { formatCurrency, formatDate, formatPercent, formatPrecisePercent } from "@/lib/format";
import { toast } from "sonner";
import { downloadTextFile } from "@/lib/actions";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { useAppStore } from "@/store/useAppStore";
import { createSupabaseApprovalRepository } from "@/features/approvals/repositories/supabaseApprovalRepository";
import { createSupabaseSimulationRepository } from "@/features/simulations/repositories/supabaseSimulationRepository";
import { getOrderNumberFromSimulation } from "@/features/simulations/services/simulationService";
import {
  canConvertApprovedSimulation,
  initializeApprovalFlow,
} from "@/features/approvals/approvalFlow";
import {
  canConvertSimulationToOrder,
  canCreateSimulation,
  canEditSimulation,
  canSubmitSimulationForApproval,
  isPendingApprovalStatus,
  normalizeRole,
} from "@/lib/permissions";
import { filterSimulationsForUser } from "@/lib/visibility";
import { getSupabaseConfigStatus } from "@/lib/supabaseClient";
import { isSupabaseProvider } from "@/lib/dataProvider";
import { createNegotiationWallet } from "@/features/negotiation-wallets";

export const Route = createFileRoute("/_app/simulacoes/$id")({
  component: SimulationDetailPage,
});

const STEPS = ["Pedido", "Produtos", "NF/Custos", "Despesas", "Pagamento", "Resumo"];
const ORDER_CATALOG_STORAGE_KEY = "master-flow-order-catalogs";
const SIMULATION_FORM_DRAFT_STORAGE_KEY = "master-flow-simulation-form-drafts";
type StandardExpenseType = Extract<
  ExpenseItem["type"],
  "Frete" | "Comissão" | "Custo NF" | "STRINT" | "PIS E COFINS" | "Financeiro" | "Outros"
>;

const STANDARD_EXPENSE_TYPES: StandardExpenseType[] = [
  "Frete",
  "Comissão",
  "Custo NF",
  "STRINT",
  "PIS E COFINS",
  "Financeiro",
  "Outros",
];
const REQUIRED_TEXT_FIELDS: Array<
  [
    keyof Pick<
      Simulation,
      | "client"
      | "supplier"
      | "deliveryCity"
      | "deliveryState"
      | "owner"
      | "unit"
      | "paymentCondition"
    >,
    string,
  ]
> = [
  ["client", "cliente"],
  ["supplier", "fornecedor"],
  ["deliveryCity", "cidade de entrega"],
  ["deliveryState", "UF"],
  ["owner", "responsável"],
  ["unit", "unidade"],
  ["paymentCondition", "condição de pagamento"],
];

interface OrderCatalogItem {
  id: string;
  name: string;
  city?: string;
  state?: string;
  unit?: string;
  role?: string;
  email?: string;
}

type OrderCatalogKey = "clients" | "suppliers";
type OrderCatalogField = keyof Pick<
  OrderCatalogItem,
  "name" | "city" | "state" | "unit" | "role" | "email"
>;

interface OrderCatalogs {
  clients: OrderCatalogItem[];
  suppliers: OrderCatalogItem[];
}

interface SavedSimulationFormDraft {
  draft: Simulation;
  step: number;
  updatedAt: string;
}

type SavedSimulationFormDrafts = Record<string, SavedSimulationFormDraft>;

function createInitialOrderCatalogs(clients: Client[], suppliers: Supplier[]): OrderCatalogs {
  return {
    clients: clients
      .filter((client) => client.active ?? true)
      .map((client) => ({
        id: client.id,
        name: client.name,
        city: client.city,
        state: client.state,
        unit: client.unit,
      })),
    suppliers: suppliers
      .filter((supplier) => supplier.active ?? true)
      .map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        city: supplier.city,
        state: supplier.state,
      })),
  };
}

function getOptionsWithCurrent(items: OrderCatalogItem[], current: string) {
  if (!current.trim() || items.some((item) => item.name === current)) return items;
  return [{ id: `current-${current}`, name: current }, ...items];
}

function validateSimulation(simulation: Simulation) {
  const missingFields = REQUIRED_TEXT_FIELDS.filter(
    ([key]) => !String(simulation[key] ?? "").trim(),
  ).map(([, label]) => label);

  if (simulation.products.length === 0) missingFields.push("ao menos um produto");
  if (
    simulation.products.some(
      (product) =>
        !product.product.trim() ||
        product.boxes <= 0 ||
        product.unitsPerBox <= 0 ||
        product.saleUnit <= 0 ||
        product.costUnit < 0,
    )
  ) {
    missingFields.push("produtos com quantidades e valores válidos");
  }

  return missingFields;
}

function createEmptySimulation(
  user?: User | null,
  clients: Client[] = [],
  suppliers: Supplier[] = [],
): Simulation {
  const id = `sim-${Date.now()}`;
  const owner = user?.name ?? "";
  const unit = user?.unit ?? businessUnits[0];
  const firstClient = clients.find((client) => client.active ?? true);
  const firstSupplier = suppliers.find((supplier) => supplier.active ?? true);
  return {
    id,
    number: `SIM-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 999)).padStart(4, "0")}`,
    client: firstClient?.name ?? "",
    supplier: firstSupplier?.name ?? "",
    deliveryCity: firstClient?.city ?? "",
    deliveryState: firstClient?.state ?? "",
    owner,
    unit,
    paymentCondition: "28 dias",
    deliveryDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString(),
    notes: "",
    status: "Rascunho",
    priority: "Média",
    products: [],
    purchaseItems: [],
    expenseItems: normalizeExpenseItems([]),
    financial: {
      installmentDays: [14, 28],
      bank: "",
      paymentMethod: "Boleto bancário",
      account: "",
      discountPercent: 0,
      notes: "",
    },
  };
}

function clampStep(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(STEPS.length - 1, value));
}

function getSimulationFormDraftKey(routeId: string, userId?: string, userEmail?: string) {
  if (routeId !== "nova") return routeId;
  return `nova:${userId ?? userEmail ?? "visitante"}`;
}

function readSavedSimulationFormDraft(key: string) {
  const drafts = readLocalStorage<SavedSimulationFormDrafts>(SIMULATION_FORM_DRAFT_STORAGE_KEY, {});
  return drafts[key];
}

function writeSavedSimulationFormDraft(key: string, draft: Simulation, step: number) {
  const drafts = readLocalStorage<SavedSimulationFormDrafts>(SIMULATION_FORM_DRAFT_STORAGE_KEY, {});
  writeLocalStorage<SavedSimulationFormDrafts>(SIMULATION_FORM_DRAFT_STORAGE_KEY, {
    ...drafts,
    [key]: { draft, step, updatedAt: new Date().toISOString() },
  });
}

function clearSavedSimulationFormDraft(key: string) {
  if (typeof window === "undefined") return;
  const drafts = readLocalStorage<SavedSimulationFormDrafts>(SIMULATION_FORM_DRAFT_STORAGE_KEY, {});
  if (!drafts[key]) return;
  const nextDrafts = { ...drafts };
  delete nextDrafts[key];
  writeLocalStorage<SavedSimulationFormDrafts>(SIMULATION_FORM_DRAFT_STORAGE_KEY, nextDrafts);
}

function mergeWorkflowStateFromServer(draft: Simulation, source: Simulation): Simulation {
  return {
    ...draft,
    status: source.status,
    approvalChecklist: source.approvalChecklist,
    approvalFlow: source.approvalFlow,
    approvalNotes: source.approvalNotes,
    adjustmentReason: source.adjustmentReason,
    adjustmentRequestedAt: source.adjustmentRequestedAt,
    adjustmentRequestedBy: source.adjustmentRequestedBy,
    adjustmentStage: source.adjustmentStage,
    orderId: source.orderId,
    convertedAt: source.convertedAt,
  };
}

function createDefaultExpenseItem(type: StandardExpenseType): ExpenseItem {
  const defaults: Record<
    StandardExpenseType,
    Pick<ExpenseItem, "calculationType" | "calculationBase" | "value">
  > = {
    Frete: { calculationType: "fixed", value: 0 },
    Comissão: { calculationType: "percentage", calculationBase: "revenue", value: 2.5 },
    "Custo NF": { calculationType: "percentage", calculationBase: "purchaseTotal", value: 2 },
    STRINT: { calculationType: "percentage", calculationBase: "purchaseTotal", value: 0.4 },
    "PIS E COFINS": { calculationType: "percentage", calculationBase: "revenue", value: 1.25 },
    Financeiro: { calculationType: "percentage", calculationBase: "revenue", value: 1.4 },
    Outros: { calculationType: "fixed", value: 0 },
  };

  return {
    id: `ex-default-${type.toLowerCase().replace(/\s+/g, "-")}`,
    type,
    ...defaults[type],
  };
}

function isStandardExpenseType(type: ExpenseItem["type"]): type is StandardExpenseType {
  return STANDARD_EXPENSE_TYPES.includes(type as StandardExpenseType);
}

function normalizeExpenseItems(items: ExpenseItem[]) {
  const standardByType = new Map<StandardExpenseType, ExpenseItem>();
  const extraItems: ExpenseItem[] = [];

  items.forEach((item) => {
    const normalizedItem = { ...item, value: Number(item.value) || 0 };
    if (!isStandardExpenseType(normalizedItem.type)) {
      if (normalizedItem.value !== 0) extraItems.push(normalizedItem);
      return;
    }

    const current = standardByType.get(normalizedItem.type);
    if (!current || (current.value === 0 && normalizedItem.value !== 0)) {
      standardByType.set(normalizedItem.type, normalizedItem);
    }
  });

  return [
    ...STANDARD_EXPENSE_TYPES.map(
      (type) => standardByType.get(type) ?? createDefaultExpenseItem(type),
    ),
    ...extraItems,
  ];
}

function inferPurchaseDivisionTotal(items: PurchaseItem[], fallbackTotal: number) {
  const itemWithDivision = items.find((item) => item.value > 0 && item.allocationPercent > 0);
  if (!itemWithDivision) return fallbackTotal;
  return itemWithDivision.value / (itemWithDivision.allocationPercent / 100);
}

function saveApprovalRecordWhenEnabled(payload: {
  id: string;
  simulationId: string;
  stage?: "financial" | "principal";
  approverId?: string;
  status: "pending" | "approved" | "adjustment_requested" | "rejected";
  checklist?: Record<string, unknown>;
  comment?: string;
}) {
  if (!isSupabaseProvider()) return;
  if (!getSupabaseConfigStatus().configured) {
    toast.error("Supabase não configurado. Aprovação registrada apenas localmente.");
    return;
  }

  const repository = createSupabaseApprovalRepository();
  void repository
    .save({
      ...payload,
      decidedAt: new Date().toISOString(),
    })
    .catch((error) => {
      console.warn("Simulação salva, mas a fila auxiliar de aprovação não foi registrada.", error);
    });
}

function SimulationDetailPage() {
  const { id } = useParams({ from: "/_app/simulacoes/$id" });
  const navigate = useNavigate();
  const {
    auth,
    simulations,
    orders,
    clients,
    suppliers,
    products,
    upsertSimulation,
    upsertOrder,
    upsertNegotiationWallet,
  } = useAppContext();
  const addNotification = useAppStore((store) => store.addNotification);
  const currentUser = auth.user;
  const visibleSimulations = useMemo(
    () => filterSimulationsForUser(simulations, currentUser),
    [currentUser, simulations],
  );
  const [remoteSimulation, setRemoteSimulation] = useState<Simulation | null>(null);
  const localExistingSimulation =
    id === "nova" ? null : visibleSimulations.find((simulation) => simulation.id === id);
  const existingSimulation = remoteSimulation ?? localExistingSimulation;
  const draftStorageKey = useMemo(
    () => getSimulationFormDraftKey(id, currentUser?.id, currentUser?.email),
    [currentUser?.email, currentUser?.id, id],
  );
  const savedFormDraft = useMemo(
    () => readSavedSimulationFormDraft(draftStorageKey),
    [draftStorageKey],
  );
  const canUseSavedFormDraft = Boolean(
    savedFormDraft?.draft && (id === "nova" || savedFormDraft.draft.id === existingSimulation?.id),
  );
  const initial = useMemo(() => {
    const base = canUseSavedFormDraft
      ? savedFormDraft!.draft
      : (existingSimulation ?? createEmptySimulation(currentUser, clients, suppliers));
    return existingSimulation ? mergeWorkflowStateFromServer(base, existingSimulation) : base;
  }, [canUseSavedFormDraft, clients, currentUser, existingSimulation, savedFormDraft, suppliers]);
  const [draft, setDraft] = useState<Simulation>(initial);
  const [step, setStep] = useState(canUseSavedFormDraft ? clampStep(savedFormDraft?.step) : 0);
  const activeDraftStorageKeyRef = useRef(draftStorageKey);
  const canOpenSimulation = id === "nova" || Boolean(existingSimulation);
  const totals = useMemo(() => getSimulationTotals(draft), [draft]);
  const costImpact = useMemo(() => getSimulationCostImpact(draft), [draft]);
  const sensitivity = useMemo(() => getSimulationSensitivity(draft), [draft]);
  const userCanCreate = canCreateSimulation(currentUser);
  const userCanEdit = canEditSimulation(currentUser, draft);
  const userCanSubmit = canSubmitSimulationForApproval(currentUser, draft);
  const userCanConvert = canConvertSimulationToOrder(currentUser);
  const isAdminUser = currentUser ? normalizeRole(currentUser.role) === "Admin" : false;

  useEffect(() => {
    if (activeDraftStorageKeyRef.current === draftStorageKey) return;
    activeDraftStorageKeyRef.current = draftStorageKey;
    setDraft(initial);
    setStep(canUseSavedFormDraft ? clampStep(savedFormDraft?.step) : 0);
  }, [canUseSavedFormDraft, draftStorageKey, initial, savedFormDraft?.step]);

  useEffect(() => {
    setRemoteSimulation(null);
    if (id === "nova" || !auth.hasAccess || !isSupabaseProvider()) return;
    if (!getSupabaseConfigStatus().configured) return;

    let cancelled = false;
    const repository = createSupabaseSimulationRepository();

    async function loadLatestSimulation() {
      try {
        const latest = await repository.getById(id);
        if (!cancelled) setRemoteSimulation(latest);
      } catch (error) {
        console.error("Falha ao carregar simulação atualizada no Supabase.", error);
      }
    }

    void loadLatestSimulation();

    return () => {
      cancelled = true;
    };
  }, [auth.hasAccess, id]);

  useEffect(() => {
    if (!existingSimulation) return;
    setDraft((current) => mergeWorkflowStateFromServer(current, existingSimulation));
  }, [existingSimulation]);

  useEffect(() => {
    if (!canOpenSimulation) return;
    writeSavedSimulationFormDraft(draftStorageKey, draft, step);
  }, [canOpenSimulation, draft, draftStorageKey, step]);

  useEffect(() => {
    setDraft((current) => {
      const normalizedExpenseItems = normalizeExpenseItems(current.expenseItems);
      const sameExpenseItems =
        normalizedExpenseItems.length === current.expenseItems.length &&
        normalizedExpenseItems.every(
          (item, index) =>
            item.id === current.expenseItems[index]?.id &&
            item.type === current.expenseItems[index]?.type &&
            item.value === current.expenseItems[index]?.value,
        );
      if (sameExpenseItems) return current;
      return { ...current, expenseItems: normalizedExpenseItems };
    });
  }, [draftStorageKey]);

  useEffect(() => {
    if (!currentUser || isAdminUser) return;
    setDraft((current) => {
      const nextOwner = currentUser.name;
      const nextUnit = current.unit || currentUser.unit || businessUnits[0];
      if (current.owner === nextOwner && current.unit === nextUnit) return current;
      return { ...current, owner: nextOwner, unit: nextUnit };
    });
  }, [currentUser, isAdminUser]);

  if (!canOpenSimulation) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link to="/simulacoes">
            <ArrowLeft /> Voltar para simulações
          </Link>
        </Button>
        <Card className="shadow-card">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Simulação não encontrada para sua conta.
          </CardContent>
        </Card>
      </div>
    );
  }

  function update<K extends keyof Simulation>(key: K, value: Simulation[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveDraft() {
    if (!canEditSimulation(currentUser, draft)) {
      toast.error("Seu perfil não pode editar esta simulação.");
      return;
    }

    const minimumErrors = REQUIRED_TEXT_FIELDS.filter(
      ([key]) => !String(draft[key] ?? "").trim(),
    ).map(([, label]) => label);
    if (minimumErrors.length > 0) {
      toast.error(`Revise antes de salvar: ${minimumErrors.join(", ")}.`);
      return;
    }

    upsertSimulation(draft);
    clearSavedSimulationFormDraft(draftStorageKey);
    toast.success("Simulação salva como rascunho");
    if (id === "nova") {
      navigate({ to: "/simulacoes/$id", params: { id: draft.id } });
    }
  }

  function duplicateCurrentSimulation() {
    if (!canCreateSimulation(currentUser)) {
      toast.error("Seu perfil não pode criar ou duplicar simulações.");
      return;
    }

    const id = `sim-${Date.now()}`;
    const copy: Simulation = {
      ...draft,
      id,
      number: `SIM-2026-${String(Math.floor(Date.now() % 10000)).padStart(4, "0")}`,
      owner: currentUser?.name ?? draft.owner,
      unit: currentUser?.unit ?? draft.unit,
      status: "Rascunho",
      createdAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString(),
      approvalChecklist: undefined,
      approvalFlow: undefined,
      approvalNotes: undefined,
      orderId: undefined,
      convertedAt: undefined,
    };
    upsertSimulation(copy);
    clearSavedSimulationFormDraft(draftStorageKey);
    toast.success(`Simulação duplicada: ${copy.number}`);
    navigate({ to: "/simulacoes/$id", params: { id } });
  }

  function convertToOrder() {
    if (!canConvertSimulationToOrder(currentUser)) {
      toast.error("Seu perfil não pode converter simulações em pedido.");
      return;
    }
    if (!canConvertApprovedSimulation(draft)) {
      toast.error("A simulação precisa das aprovações financeira e final antes de virar pedido.");
      return;
    }

    if (orders.some((order) => order.simulationId === draft.id) || draft.orderId) {
      toast.error("Esta simulação já foi convertida em pedido.");
      return;
    }
    const orderId = `ord-${Date.now()}`;
    const orderNumber = getOrderNumberFromSimulation(draft.number);
    const order = {
      id: orderId,
      number: orderNumber,
      simulationId: draft.id,
      client: draft.client,
      origin: draft.unit,
      destination: `${draft.deliveryCity} • ${draft.deliveryState}`,
      owner: draft.owner,
      unit: draft.unit,
      date: new Date().toISOString(),
      expectedDelivery: draft.deliveryDate,
      totalValue: totals.revenue,
      status: "Aguardando faturamento" as const,
      priority: draft.priority,
      products: draft.products,
      billingProgress: 0,
      deliveryProgress: 0,
      paymentTerms: draft.paymentCondition,
      logisticsStatus: "Pedido criado a partir de simulação aprovada.",
      documents: ["Pedido interno"],
      notes: [`Origem: conversão da simulação ${draft.number}.`],
      timeline: [
        {
          id: `tl-${Date.now()}`,
          title: "Pedido criado",
          description: "Conversão da simulação aprovada.",
          date: new Date().toISOString(),
          completed: true,
        },
      ],
    };
    const next = { ...draft, orderId, convertedAt: new Date().toISOString() };
    upsertSimulation(next);
    upsertOrder(order);
    upsertNegotiationWallet(createNegotiationWallet(order, draft));
    clearSavedSimulationFormDraft(draftStorageKey);
    addNotification({
      id: `not-${Date.now()}`,
      title: "Pedido criado",
      description: `${order.number} foi criado a partir da simulação ${draft.number}.`,
      type: "success",
      createdAt: new Date().toISOString(),
      unread: true,
      entityType: "order",
      entityId: order.id,
      targetUserId: currentUser?.id,
      targetUserEmail: currentUser?.email,
      targetUserName: draft.owner,
    });
    setDraft(next);
    toast.success(`Pedido ${orderNumber} criado.`, {
      action: {
        label: "Abrir",
        onClick: () => navigate({ to: "/pedidos/$id", params: { id: orderId } }),
      },
    });
  }

  function submitForApproval() {
    if (!canSubmitSimulationForApproval(currentUser, draft)) {
      toast.error("Seu perfil não pode enviar esta simulação para aprovação.");
      return;
    }

    const validationErrors = validateSimulation(draft);
    if (validationErrors.length > 0) {
      toast.error(`Revise antes de enviar: ${validationErrors.join(", ")}.`);
      return;
    }

    const next = initializeApprovalFlow({
      ...draft,
      status: "Aguardando financeiro" as const,
      approvalChecklist: undefined,
      approvalNotes: undefined,
      adjustmentReason: undefined,
      adjustmentRequestedAt: undefined,
      adjustmentRequestedBy: undefined,
      adjustmentStage: undefined,
    });
    if (!window.confirm("Enviar esta simulação para aprovação?")) return;
    setRemoteSimulation(next);
    upsertSimulation(next);
    saveApprovalRecordWhenEnabled({
      id: `apr-${next.id}-financial`,
      simulationId: next.id,
      stage: "financial",
      approverId: currentUser?.id,
      status: "pending",
      checklist: next.approvalChecklist,
      comment: "Simulação enviada para aprovação.",
    });
    clearSavedSimulationFormDraft(draftStorageKey);
    addNotification({
      id: `not-${Date.now()}`,
      title: "Simulação enviada para aprovação",
      description: `${next.number} está aguardando aprovação financeira.`,
      type: "warning",
      createdAt: new Date().toISOString(),
      unread: true,
      entityType: "approval",
      entityId: next.id,
      targetRole: "Financeiro",
    });
    setDraft(next);
    toast.success("Simulação enviada para aprovação");
    navigate({ to: "/simulacoes/$id", params: { id: next.id } });
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/simulacoes">
          <ArrowLeft /> Voltar para simulações
        </Link>
      </Button>

      <PageHeader
        title={draft.number}
        description={`${draft.client} • ${draft.supplier} • ${draft.owner}`}
        action={
          <>
            {userCanCreate ? (
              <Button variant="outline" onClick={duplicateCurrentSimulation}>
                <Copy /> Duplicar
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() =>
                downloadTextFile(
                  `${draft.number}.json`,
                  JSON.stringify(draft, null, 2),
                  "application/json",
                )
              }
            >
              <Download /> Exportar
            </Button>
            {userCanEdit ? (
              <Button variant="outline" onClick={saveDraft}>
                <Pencil /> Salvar rascunho
              </Button>
            ) : null}
            {canConvertApprovedSimulation(draft) && !draft.orderId && userCanConvert ? (
              <Button onClick={convertToOrder}>
                <CheckCircle2 /> Converter em pedido
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={draft.status} />
        <ViabilityBadge viability={totals.viability} />
        <Badge variant="outline" className="rounded-full">
          Prioridade: {draft.priority}
        </Badge>
      </div>

      {isSimulationAdjustmentRequested(draft) ? (
        <Card className="border-warning/40 bg-warning-soft/40 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4" />
              Motivo do reajuste
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p className="text-sm leading-relaxed text-foreground">
                  {getSimulationAdjustmentReason(draft)}
                </p>
                {draft.adjustmentRequestedBy || draft.adjustmentRequestedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Solicitado por {draft.adjustmentRequestedBy ?? "aprovador"}{" "}
                    {draft.adjustmentRequestedAt
                      ? `em ${formatDate(draft.adjustmentRequestedAt)}`
                      : ""}
                  </p>
                ) : null}
              </div>
              {userCanSubmit ? (
                <Button onClick={submitForApproval} className="shrink-0">
                  <Send /> Enviar novamente
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ProgressStepper steps={STEPS} activeStep={step} onStepChange={setStep} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="shadow-card">
          <CardContent className="space-y-6 p-6">
            {step === 0 && (
              <ClientStep
                draft={draft}
                clients={clients}
                suppliers={suppliers}
                currentUser={currentUser}
                isAdminUser={isAdminUser}
                update={update}
              />
            )}
            {step === 1 && <ProductsStep draft={draft} setDraft={setDraft} />}
            {step === 2 && <PurchaseStep draft={draft} setDraft={setDraft} />}
            {step === 3 && <ExpensesStep draft={draft} setDraft={setDraft} />}
            {step === 4 && <FinancialStep draft={draft} setDraft={setDraft} />}
            {step === 5 && (
              <ResultStep
                draft={draft}
                totals={totals}
                costImpact={costImpact}
                sensitivity={sensitivity}
                onSubmitForApproval={submitForApproval}
                onConvertToOrder={convertToOrder}
                canSubmit={userCanSubmit}
                canConvert={userCanConvert}
              />
            )}

            <div className="flex items-center justify-between border-t border-border pt-4">
              <Button
                variant="outline"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Voltar
              </Button>
              <Button
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={step === STEPS.length - 1}
              >
                Próxima etapa
              </Button>
            </div>
          </CardContent>
        </Card>

        <SummarySidebar totals={totals} draft={draft} />
      </div>
    </div>
  );
}

function ClientStep({
  draft,
  clients,
  suppliers,
  currentUser,
  isAdminUser,
  update,
}: {
  draft: Simulation;
  clients: Client[];
  suppliers: Supplier[];
  currentUser: User | null;
  isAdminUser: boolean;
  update: <K extends keyof Simulation>(key: K, value: Simulation[K]) => void;
}) {
  const [catalogs, setCatalogs] = useState<OrderCatalogs>(() =>
    readLocalStorage(ORDER_CATALOG_STORAGE_KEY, createInitialOrderCatalogs(clients, suppliers)),
  );
  const clientOptions = useMemo(
    () => getOptionsWithCurrent(catalogs.clients, draft.client),
    [catalogs.clients, draft.client],
  );
  const supplierOptions = useMemo(
    () => getOptionsWithCurrent(catalogs.suppliers, draft.supplier),
    [catalogs.suppliers, draft.supplier],
  );

  useEffect(() => {
    writeLocalStorage(ORDER_CATALOG_STORAGE_KEY, catalogs);
  }, [catalogs]);

  useEffect(() => {
    const officialCatalogs = createInitialOrderCatalogs(clients, suppliers);
    setCatalogs((current) => ({
      ...current,
      clients: officialCatalogs.clients,
      suppliers: officialCatalogs.suppliers,
    }));
  }, [clients, suppliers]);

  function updateCatalog(key: OrderCatalogKey, items: OrderCatalogItem[]) {
    setCatalogs((current) => ({ ...current, [key]: items }));
  }

  function selectClient(name: string) {
    const client = catalogs.clients.find((item) => item.name === name);
    update("client", name);
    if (client?.city) update("deliveryCity", client.city);
    if (client?.state) update("deliveryState", client.state);
    update("unit", client?.unit || currentUser?.unit || draft.unit || businessUnits[0]);
  }

  function handleCatalogUse(key: OrderCatalogKey, item: OrderCatalogItem) {
    if (key === "clients") {
      selectClient(item.name);
      return;
    }
    if (key === "suppliers") {
      update("supplier", item.name);
      return;
    }
  }

  function handleCatalogDelete(key: OrderCatalogKey, item: OrderCatalogItem) {
    if (key === "clients" && draft.client === item.name) {
      update("client", "");
      update("deliveryCity", "");
      update("deliveryState", "");
    }
    if (key === "suppliers" && draft.supplier === item.name) update("supplier", "");
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Dados do pedido"
        description="Preencha os campos principais da OP antes de informar produtos e valores."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Cliente">
          <Select value={draft.client} onValueChange={selectClient}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione ou cadastre um cliente" />
            </SelectTrigger>
            <SelectContent>
              {clientOptions.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fornecedor">
          <Select value={draft.supplier} onValueChange={(v) => update("supplier", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione ou cadastre um fornecedor" />
            </SelectTrigger>
            <SelectContent>
              {supplierOptions.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cidade de entrega">
          <Input
            value={draft.deliveryCity}
            onChange={(e) => update("deliveryCity", e.target.value)}
          />
        </Field>
        <Field label="UF">
          <Input
            value={draft.deliveryState}
            onChange={(e) => update("deliveryState", e.target.value)}
          />
        </Field>
        <Field label="Responsável">
          <Input value={isAdminUser ? draft.owner : currentUser?.name || draft.owner} disabled />
        </Field>
        <Field label="Prazo">
          <Input
            value={draft.paymentCondition}
            onChange={(e) => update("paymentCondition", e.target.value)}
          />
        </Field>
        <Field label="Prioridade">
          <Select
            value={draft.priority}
            onValueChange={(v) => update("priority", v as Simulation["priority"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Baixa", "Média", "Alta", "Crítica"].map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data prevista">
          <Input
            type="date"
            value={draft.deliveryDate.slice(0, 10)}
            onChange={(e) => update("deliveryDate", `${e.target.value}T12:00:00-03:00`)}
          />
        </Field>
        <Field label="Validade">
          <Input
            type="date"
            value={draft.validUntil.slice(0, 10)}
            onChange={(e) => update("validUntil", `${e.target.value}T12:00:00-03:00`)}
          />
        </Field>
      </div>
      <Field label="Observações">
        <Textarea
          rows={3}
          value={draft.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Notas, premissas e detalhes específicos da negociação..."
        />
      </Field>
      <OrderCatalogCrud
        catalogs={catalogs}
        updateCatalog={updateCatalog}
        onUse={handleCatalogUse}
        onDelete={handleCatalogDelete}
        canDelete={isAdminUser}
      />
    </div>
  );
}

function OrderCatalogCrud({
  catalogs,
  updateCatalog,
  onUse,
  onDelete,
  canDelete,
}: {
  catalogs: OrderCatalogs;
  updateCatalog: (key: OrderCatalogKey, items: OrderCatalogItem[]) => void;
  onUse: (key: OrderCatalogKey, item: OrderCatalogItem) => void;
  onDelete: (key: OrderCatalogKey, item: OrderCatalogItem) => void;
  canDelete: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <Button type="button" variant="outline" onClick={() => setIsOpen((current) => !current)}>
        <Pencil /> {isOpen ? "Fechar cadastros" : "Gerenciar cadastros"}
      </Button>
      {isOpen && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <SectionTitle
            title="Cadastros do pedido"
            description="Crie, edite ou selecione opções usadas nos campos acima."
          />
          <Tabs defaultValue="clients">
            <TabsList className="flex w-full flex-wrap justify-start">
              <TabsTrigger value="clients">Clientes</TabsTrigger>
              <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
            </TabsList>
            <TabsContent value="clients">
              <CatalogEditor
                catalogKey="clients"
                title="Clientes"
                items={catalogs.clients}
                fields={[
                  { key: "name", label: "Cliente" },
                  { key: "city", label: "Cidade" },
                  { key: "state", label: "UF" },
                  { key: "unit", label: "Unidade" },
                ]}
                updateCatalog={updateCatalog}
                onUse={onUse}
                onDelete={onDelete}
                canDelete={canDelete}
              />
            </TabsContent>
            <TabsContent value="suppliers">
              <CatalogEditor
                catalogKey="suppliers"
                title="Fornecedores"
                items={catalogs.suppliers}
                fields={[
                  { key: "name", label: "Fornecedor" },
                  { key: "city", label: "Cidade" },
                  { key: "state", label: "UF" },
                ]}
                updateCatalog={updateCatalog}
                onUse={onUse}
                onDelete={onDelete}
                canDelete={canDelete}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function CatalogEditor({
  catalogKey,
  title,
  items,
  fields,
  updateCatalog,
  onUse,
  onDelete,
  canDelete,
}: {
  catalogKey: OrderCatalogKey;
  title: string;
  items: OrderCatalogItem[];
  fields: Array<{ key: OrderCatalogField; label: string }>;
  updateCatalog: (key: OrderCatalogKey, items: OrderCatalogItem[]) => void;
  onUse: (key: OrderCatalogKey, item: OrderCatalogItem) => void;
  onDelete: (key: OrderCatalogKey, item: OrderCatalogItem) => void;
  canDelete: boolean;
}) {
  const [form, setForm] = useState<OrderCatalogItem>({ id: "", name: "" });
  const isEditing = Boolean(form.id);

  function setField(key: OrderCatalogField, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function clearForm() {
    setForm({ id: "", name: "" });
  }

  function saveItem() {
    const name = form.name.trim();
    if (!name) {
      toast.error("Informe o nome antes de salvar.");
      return;
    }

    const nextItem = {
      ...form,
      id: form.id || `${catalogKey}-${Date.now()}`,
      name,
    };
    const nextItems = isEditing
      ? items.map((item) => (item.id === nextItem.id ? nextItem : item))
      : [...items, nextItem];

    updateCatalog(catalogKey, nextItems);
    onUse(catalogKey, nextItem);
    setForm(nextItem);
    toast.success("Cadastro salvo.");
  }

  function deleteItem(item: OrderCatalogItem) {
    if (!window.confirm(`Excluir "${item.name}" deste cadastro?`)) return;
    updateCatalog(
      catalogKey,
      items.filter((current) => current.id !== item.id),
    );
    onDelete(catalogKey, item);
    if (form.id === item.id) clearForm();
    toast.success("Cadastro excluído.");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="grid gap-3 md:grid-cols-4">
        {fields.map((field) => (
          <Field key={field.key} label={field.label}>
            <Input
              value={String(form[field.key] ?? "")}
              onChange={(e) => setField(field.key, e.target.value)}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={saveItem}>
          <Pencil /> {isEditing ? "Salvar edição" : "Cadastrar"}
        </Button>
        <Button type="button" variant="outline" onClick={clearForm}>
          <Plus /> Novo
        </Button>
        {isEditing && (
          <Button type="button" variant="outline" onClick={() => onUse(catalogKey, form)}>
            Usar neste pedido
          </Button>
        )}
        {isEditing && canDelete && (
          <Button type="button" variant="ghost" onClick={() => deleteItem(form)}>
            <Trash2 /> Excluir
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cadastro salvo.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {fields.map((field) => (
                  <TableHead key={field.key}>{field.label}</TableHead>
                ))}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  {fields.map((field) => (
                    <TableCell key={field.key}>{String(item[field.key] ?? "-")}</TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setForm(item)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onUse(catalogKey, item)}
                      >
                        Usar
                      </Button>
                      {canDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteItem(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ProductsStep({
  draft,
  setDraft,
}: {
  draft: Simulation;
  setDraft: React.Dispatch<React.SetStateAction<Simulation>>;
}) {
  const merchandiseCost = draft.products.reduce((sum, item) => sum + getProductCostTotal(item), 0);
  const purchaseTotal = draft.purchaseItems.length
    ? draft.purchaseItems.reduce((sum, item) => sum + item.value, 0)
    : merchandiseCost;
  const purchaseFactor = merchandiseCost > 0 ? purchaseTotal / merchandiseCost : 1;

  function roundNumber(value: number, digits = 2) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function numberInputValue(value: number, digits = 2) {
    return roundNumber(value, digits);
  }

  function addProduct() {
    const newProduct: SimulationProduct = {
      id: `sp-${Date.now()}`,
      code: "",
      product: "",
      boxes: 0,
      unitsPerBox: 1,
      quantityTotal: 0,
      costUnit: 0,
      saleUnit: 0,
    };
    setDraft((d) => ({ ...d, products: [...d.products, newProduct] }));
  }

  function updateProduct(id: string, patch: Partial<SimulationProduct>) {
    setDraft((d) => ({
      ...d,
      products: d.products.map((p) => {
        if (p.id !== id) return p;
        const merged = { ...p, ...patch };
        const quantitySourceChanged = "boxes" in patch || "unitsPerBox" in patch;
        const quantityChanged = quantitySourceChanged || "quantityTotal" in patch;
        const costUnitChanged = "costUnit" in patch;
        const saleUnitChanged = "saleUnit" in patch;

        if (quantitySourceChanged && !("quantityTotal" in patch)) {
          merged.quantityTotal = roundNumber(merged.boxes * merged.unitsPerBox, 0);
        }
        if (quantityChanged || costUnitChanged) {
          merged.costTotal = roundNumber(merged.quantityTotal * merged.costUnit);
        }
        if (quantityChanged || saleUnitChanged) {
          merged.saleTotal = roundNumber(merged.quantityTotal * merged.saleUnit);
        }
        return merged;
      }),
    }));
  }

  function updateProductCostTotal(id: string, value: number) {
    setDraft((d) => ({
      ...d,
      products: d.products.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          costTotal: value,
          costUnit: p.quantityTotal > 0 ? roundNumber(value / p.quantityTotal) : p.costUnit,
        };
      }),
    }));
  }

  function updateProductInvoicePrice(id: string, value: number) {
    updateProduct(id, { invoicePrice: value });
  }

  function updateProductSaleTotal(id: string, value: number) {
    setDraft((d) => ({
      ...d,
      products: d.products.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          saleTotal: value,
          saleUnit: p.quantityTotal > 0 ? roundNumber(value / p.quantityTotal) : p.saleUnit,
        };
      }),
    }));
  }

  function updateProductGrossProfit(id: string, value: number) {
    setDraft((d) => ({
      ...d,
      products: d.products.map((p) => {
        if (p.id !== id) return p;
        const costTotal = getProductCostTotal(p);
        const saleTotal = roundNumber(costTotal + value);
        return {
          ...p,
          saleTotal,
          saleUnit: p.quantityTotal > 0 ? roundNumber(saleTotal / p.quantityTotal) : p.saleUnit,
        };
      }),
    }));
  }

  function updateProductMarginPercent(id: string, value: number) {
    setDraft((d) => ({
      ...d,
      products: d.products.map((p) => {
        if (p.id !== id) return p;
        const costTotal = getProductCostTotal(p);
        const saleTotal =
          value < 100 ? roundNumber(costTotal / (1 - value / 100)) : getProductSaleTotal(p);
        return {
          ...p,
          saleTotal,
          saleUnit: p.quantityTotal > 0 ? roundNumber(saleTotal / p.quantityTotal) : p.saleUnit,
        };
      }),
    }));
  }

  function updateProductMarkupPercent(id: string, value: number) {
    setDraft((d) => ({
      ...d,
      products: d.products.map((p) => {
        if (p.id !== id) return p;
        const costTotal = getProductCostTotal(p);
        const saleTotal = roundNumber(costTotal * (1 + value / 100));
        return {
          ...p,
          saleTotal,
          saleUnit: p.quantityTotal > 0 ? roundNumber(saleTotal / p.quantityTotal) : p.saleUnit,
        };
      }),
    }));
  }

  function removeProduct(id: string) {
    setDraft((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Produtos"
        description="Inclua os itens usando os mesmos campos da tabela da planilha."
      />
      {draft.products.length === 0 ? (
        <EmptyState
          title="Nenhum produto adicionado"
          description="Adicione produtos para compor a simulação."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>COD.</TableHead>
                <TableHead>PRODUTO</TableHead>
                <TableHead className="text-right">QTD. (CX)</TableHead>
                <TableHead className="text-right">QTD.</TableHead>
                <TableHead className="text-right">QTD. (UNID)</TableHead>
                <TableHead className="text-right">VALOR (R$)</TableHead>
                <TableHead className="text-right">CUSTO TOTAL (R$)</TableHead>
                <TableHead className="text-right">PREÇO NF</TableHead>
                <TableHead className="text-right">PREÇO VENDA (R$)</TableHead>
                <TableHead className="text-right">VENDA TOTAL (R$)</TableHead>
                <TableHead className="text-right">LUCRO BRUTO (R$)</TableHead>
                <TableHead className="text-right">MARGEM (%)</TableHead>
                <TableHead className="text-right">MARKP (%)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.products.map((p) => {
                const costTotal = getProductCostTotal(p);
                const saleTotal = getProductSaleTotal(p);
                const grossProfit = saleTotal - costTotal;
                const marginPercent = saleTotal > 0 ? (grossProfit / saleTotal) * 100 : 0;
                const markupPercent = costTotal > 0 ? (saleTotal / costTotal - 1) * 100 : 0;
                const invoicePrice = p.costUnit * purchaseFactor;

                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Input
                        value={p.code}
                        onChange={(e) => updateProduct(p.id, { code: e.target.value })}
                        className="w-24"
                        placeholder="COD."
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={p.product}
                        onChange={(e) => updateProduct(p.id, { product: e.target.value })}
                        className="min-w-64"
                        placeholder="Nome do produto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={p.boxes}
                        onChange={(e) => updateProduct(p.id, { boxes: Number(e.target.value) })}
                        className="ml-auto w-20 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={p.unitsPerBox}
                        onChange={(e) =>
                          updateProduct(p.id, { unitsPerBox: Number(e.target.value) })
                        }
                        className="ml-auto w-20 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={numberInputValue(p.quantityTotal, 0)}
                        onChange={(e) =>
                          updateProduct(p.id, { quantityTotal: Number(e.target.value) })
                        }
                        className="ml-auto w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        value={p.costUnit}
                        onChange={(e) => updateProduct(p.id, { costUnit: Number(e.target.value) })}
                        className="ml-auto w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={numberInputValue(costTotal)}
                        onChange={(e) => updateProductCostTotal(p.id, Number(e.target.value))}
                        className="ml-auto w-28 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={numberInputValue(p.invoicePrice ?? invoicePrice)}
                        onChange={(e) => updateProductInvoicePrice(p.id, Number(e.target.value))}
                        className="ml-auto w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        value={p.saleUnit}
                        onChange={(e) => updateProduct(p.id, { saleUnit: Number(e.target.value) })}
                        className="ml-auto w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={numberInputValue(saleTotal)}
                        onChange={(e) => updateProductSaleTotal(p.id, Number(e.target.value))}
                        className="ml-auto w-28 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Input
                        type="number"
                        step="0.01"
                        value={numberInputValue(grossProfit)}
                        onChange={(e) => updateProductGrossProfit(p.id, Number(e.target.value))}
                        className="ml-auto w-28 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Input
                        type="number"
                        step="0.01"
                        value={numberInputValue(marginPercent)}
                        onChange={(e) => updateProductMarginPercent(p.id, Number(e.target.value))}
                        className="ml-auto w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Input
                        type="number"
                        step="0.01"
                        value={numberInputValue(markupPercent)}
                        onChange={(e) => updateProductMarkupPercent(p.id, Number(e.target.value))}
                        className="ml-auto w-24 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeProduct(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Button variant="outline" onClick={addProduct}>
        <Plus /> Adicionar produto
      </Button>
    </div>
  );
}

function PurchaseStep({
  draft,
  setDraft,
}: {
  draft: Simulation;
  setDraft: React.Dispatch<React.SetStateAction<Simulation>>;
}) {
  const purchaseTotal = draft.purchaseItems.reduce((sum, item) => sum + item.value, 0);
  const inferredDivisionTotal = useMemo(
    () => inferPurchaseDivisionTotal(draft.purchaseItems, purchaseTotal),
    [draft.purchaseItems, purchaseTotal],
  );
  const [divisionTotal, setDivisionTotal] = useState(inferredDivisionTotal);
  const divisionBase = divisionTotal > 0 ? divisionTotal : purchaseTotal;

  function withComputedAllocation(items: PurchaseItem[], total = divisionBase) {
    return items.map((item) => ({
      ...item,
      allocationPercent: getPurchaseShare(item, total),
    }));
  }

  function updateDivisionTotal(value: number) {
    const nextTotal = Number.isFinite(value) ? value : 0;
    setDivisionTotal(nextTotal);
    setDraft((d) => ({ ...d, purchaseItems: withComputedAllocation(d.purchaseItems, nextTotal) }));
  }

  function addItem() {
    const item: PurchaseItem = {
      id: `pi-${Date.now()}`,
      type: "Mercadoria",
      document: "",
      supplier: draft.supplier,
      value: 0,
      allocationPercent: 0,
    };
    setDraft((d) => ({
      ...d,
      purchaseItems: withComputedAllocation([...d.purchaseItems, item], divisionBase),
    }));
  }
  function updateItem(id: string, patch: Partial<PurchaseItem>) {
    setDraft((d) => ({
      ...d,
      purchaseItems: withComputedAllocation(
        d.purchaseItems.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        divisionBase,
      ),
    }));
  }
  function remove(id: string) {
    setDraft((d) => ({
      ...d,
      purchaseItems: withComputedAllocation(
        d.purchaseItems.filter((i) => i.id !== id),
        divisionBase,
      ),
    }));
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="NF e custos"
        description="Registre NF, custo da mercadoria e complementos que fecham o custo da operação."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="VALOR TOTAL (R$)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={divisionTotal}
            onChange={(event) => updateDivisionTotal(Number(event.target.value))}
          />
        </Field>
        <Field label="DIVISÃO">
          <Input value="Calculada automaticamente: valor dividido pelo valor total" disabled />
        </Field>
      </div>
      {draft.purchaseItems.length === 0 ? (
        <EmptyState
          title="Sem NF/custos"
          description="Adicione NF, custo mercadoria ou complemento de custo."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">VALORES (R$)</TableHead>
                <TableHead className="text-right">VALOR TOTAL (R$)</TableHead>
                <TableHead className="text-right">DIVISÃO (%)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.purchaseItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Select
                      value={item.type}
                      onValueChange={(v) =>
                        updateItem(item.id, { type: v as PurchaseItem["type"] })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Mercadoria", "Impostos", "Seguro", "Complemento", "Outros"].map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.document}
                      onChange={(e) => updateItem(item.id, { document: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.supplier}
                      onChange={(e) => updateItem(item.id, { supplier: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.value}
                      onChange={(e) => updateItem(item.id, { value: Number(e.target.value) })}
                      className="ml-auto w-32 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={divisionTotal}
                      onChange={(event) => updateDivisionTotal(Number(event.target.value))}
                      className="ml-auto w-32 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPercent(getPurchaseShare(item, divisionBase), 2)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => remove(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Button variant="outline" onClick={addItem}>
        <Plus /> Adicionar NF/custo
      </Button>
    </div>
  );
}

function ExpensesStep({
  draft,
  setDraft,
}: {
  draft: Simulation;
  setDraft: React.Dispatch<React.SetStateAction<Simulation>>;
}) {
  function updateItem(id: string, patch: Partial<ExpenseItem>) {
    setDraft((d) => ({
      ...d,
      expenseItems: normalizeExpenseItems(
        d.expenseItems.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      ),
    }));
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Despesas"
        description="Informe frete, comissão, custo NF, STRINT, PIS/COFINS, financeiro e outros."
      />
      {draft.expenseItems.length === 0 ? (
        <EmptyState
          title="Sem despesas"
          description="Inclua as despesas da tabela para fechar o lucro líquido."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DESPESAS</TableHead>
                <TableHead>TIPO</TableHead>
                <TableHead>BASE</TableHead>
                <TableHead className="text-right">VALOR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.expenseItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.type}</TableCell>
                  <TableCell>
                    <Select
                      value={item.calculationType}
                      onValueChange={(v) =>
                        updateItem(item.id, {
                          calculationType: v as ExpenseItem["calculationType"],
                          calculationBase:
                            v === "percentage" ? (item.calculationBase ?? "revenue") : undefined,
                        })
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Valor fixo</SelectItem>
                        <SelectItem value="percentage">%</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.calculationBase ?? "revenue"}
                      disabled={item.calculationType === "fixed"}
                      onValueChange={(v) =>
                        updateItem(item.id, {
                          calculationBase: v as NonNullable<ExpenseItem["calculationBase"]>,
                        })
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="revenue">VENDA TOTAL (R$)</SelectItem>
                        <SelectItem value="purchaseTotal">NF / VALORES (R$)</SelectItem>
                        <SelectItem value="grossProfit">LUCRO BRUTO (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.value}
                      onChange={(e) => updateItem(item.id, { value: Number(e.target.value) })}
                      className="ml-auto w-32 text-right"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function FinancialStep({
  draft,
  setDraft,
}: {
  draft: Simulation;
  setDraft: React.Dispatch<React.SetStateAction<Simulation>>;
}) {
  function update<K extends keyof Simulation["financial"]>(
    key: K,
    value: Simulation["financial"][K],
  ) {
    setDraft((d) => ({ ...d, financial: { ...d.financial, [key]: value } }));
  }
  return (
    <div className="space-y-4">
      <SectionTitle
        title="Pagamento"
        description="Informe forma de pagamento, vencimentos e dados bancários."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="PRAZO">
          <Input
            value={draft.financial.installmentDays.join(", ")}
            onChange={(e) =>
              update(
                "installmentDays",
                e.target.value
                  .split(",")
                  .map((v) => Number(v.trim()))
                  .filter((v) => !Number.isNaN(v)),
              )
            }
          />
        </Field>
        <Field label="BANCO">
          <Input value={draft.financial.bank} onChange={(e) => update("bank", e.target.value)} />
        </Field>
        <Field label="FORMA DE PAG.">
          <Select
            value={draft.financial.paymentMethod}
            onValueChange={(v) => update("paymentMethod", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Boleto bancário", "TED", "PIX corporativo", "Cartão BNDES"].map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="CONTA">
          <Input
            value={draft.financial.account}
            onChange={(e) => update("account", e.target.value)}
          />
        </Field>
        <Field label="DESCONTO (%)">
          <Input
            type="number"
            step="0.1"
            value={draft.financial.discountPercent}
            onChange={(e) => update("discountPercent", Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="OBS. PAGAMENTO">
        <Textarea
          rows={3}
          value={draft.financial.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </Field>
    </div>
  );
}

function ResultStep({
  draft,
  totals,
  costImpact,
  sensitivity,
  onSubmitForApproval,
  onConvertToOrder,
  canSubmit,
  canConvert,
}: {
  draft: Simulation;
  totals: ReturnType<typeof getSimulationTotals>;
  costImpact: ReturnType<typeof getSimulationCostImpact>;
  sensitivity: ReturnType<typeof getSimulationSensitivity>;
  onSubmitForApproval: () => void;
  onConvertToOrder: () => void;
  canSubmit: boolean;
  canConvert: boolean;
}) {
  const pendingApproval = isPendingApprovalStatus(draft.status);
  const hasOrder = Boolean(draft.orderId);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Resumo"
        description="Confira os mesmos indicadores principais da planilha antes de aprovar."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryTile label="VENDA TOTAL (R$)" value={formatCurrency(totals.revenue)} tone="info" />
        <SummaryTile
          label="CUSTO TOTAL (R$)"
          value={formatCurrency(totals.merchandiseCost)}
          tone="warning"
        />
        <SummaryTile label="DESPESAS (R$)" value={formatCurrency(totals.expenses)} tone="warning" />
        <SummaryTile
          label="LUCRO LIQUIDO (R$)"
          value={formatCurrency(totals.netProfit)}
          tone={totals.netProfit > 0 ? "success" : "danger"}
        />
        <SummaryTile
          label="MARGEM (%)"
          value={formatPercent(totals.grossMarginPercent, 2)}
          tone="info"
        />
        <SummaryTile label="MARKP (%)" value={formatPercent(totals.markupPercent, 2)} tone="info" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>DESPESAS</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <Pie
                  data={costImpact}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {costImpact.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        [
                          "var(--color-chart-1)",
                          "var(--color-chart-2)",
                          "var(--color-chart-3)",
                          "var(--color-chart-4)",
                          "var(--color-chart-5)",
                        ][idx % 5]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  contentStyle={{
                    background: "var(--color-card)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    color: "var(--color-card-foreground)",
                  }}
                  itemStyle={{ color: "var(--color-card-foreground)" }}
                  labelStyle={{ color: "var(--color-card-foreground)" }}
                />
                <Legend
                  wrapperStyle={{ color: "var(--color-card-foreground)" }}
                  formatter={(value) => <span className="text-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MARGEM (%)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sensitivity} margin={{ top: 12, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => formatPercent(Number(v), 2)}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(v) => formatPercent(Number(v), 2)}
                  contentStyle={{
                    background: "var(--color-card)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    color: "var(--color-card-foreground)",
                  }}
                />
                <Bar dataKey="margin" radius={[8, 8, 0, 0]} fill="var(--color-primary)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Checklist do aprovador</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Resumo</TabsTrigger>
              <TabsTrigger value="products">Produtos</TabsTrigger>
              <TabsTrigger value="purchase">NF/Custos</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-2 pt-4 text-sm">
              <p>
                <strong>Cliente:</strong> {draft.client}
              </p>
              <p>
                <strong>Fornecedor:</strong> {draft.supplier}
              </p>
              <p>
                <strong>Prazo:</strong> {draft.paymentCondition}
              </p>
              <p>
                <strong>Margem líquida (%):</strong> {formatPercent(totals.marginPercent, 2)}
              </p>
            </TabsContent>
            <TabsContent value="products" className="pt-4">
              <ul className="space-y-1 text-sm">
                {draft.products.map((p) => (
                  <li key={p.id}>
                    {p.product} - QTD. (UNID): {p.quantityTotal} • PREÇO VENDA (R$):{" "}
                    {formatCurrency(p.saleUnit)}
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="purchase" className="pt-4">
              <ul className="space-y-1 text-sm">
                {draft.purchaseItems.map((p) => (
                  <li key={p.id}>
                    {p.type} - NF: {p.document} • VALORES (R$): {formatCurrency(p.value)}
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary-soft/30">
        <CardHeader>
          <CardTitle>Fluxo de aprovação</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Status atual: {draft.status}</p>
            <p className="text-muted-foreground">
              {draft.status === "Aprovada" && hasOrder
                ? "A simulação já foi aprovada e o pedido foi criado."
                : draft.status === "Aprovada"
                  ? "A simulação foi aprovada e já pode virar pedido."
                  : pendingApproval
                    ? "A simulação está na fila da Central de aprovações."
                    : canSubmit
                      ? "Revise o resumo e envie a simulação para aprovação."
                      : "Seu perfil pode consultar esta simulação, mas não enviá-la para aprovação."}
            </p>
          </div>
          {canConvertApprovedSimulation(draft) && !hasOrder && canConvert ? (
            <Button onClick={onConvertToOrder}>
              <CheckCircle2 /> Converter em pedido
            </Button>
          ) : pendingApproval || hasOrder || !canSubmit ? null : (
            <Button onClick={onSubmitForApproval}>
              <Send /> Enviar para aprovação
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummarySidebar({
  draft,
  totals,
}: {
  draft: Simulation;
  totals: ReturnType<typeof getSimulationTotals>;
}) {
  const expenseBases = {
    revenue: totals.revenue,
    purchaseTotal: totals.purchaseTotal,
    grossProfit: totals.grossProfit,
  };
  const expenseBreakdown = draft.expenseItems.map((item) => ({
    name: item.type,
    value: getExpenseTotal(item, expenseBases),
    percent:
      item.calculationType === "percentage"
        ? item.value
        : totals.revenue > 0
          ? (item.value / totals.revenue) * 100
          : 0,
  }));
  const expensePercentTotal = expenseBreakdown.reduce((sum, item) => sum + item.percent, 0);
  return (
    <aside className="space-y-4">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Resumo da planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="VENDA TOTAL (R$)" value={formatCurrency(totals.revenue)} />
          <Row label="CUSTO TOTAL (R$)" value={formatCurrency(totals.merchandiseCost)} />
          <Row label="DESPESAS (R$)" value={formatCurrency(totals.expenses)} />
          <Row label="LUCRO BRUTO (R$)" value={formatCurrency(totals.grossProfit)} />
          <Row label="LUCRO LIQUIDO (R$)" value={formatCurrency(totals.netProfit)} bold />
          <Row label="MARGEM (%)" value={formatPercent(totals.grossMarginPercent, 2)} />
          <Row label="MARKP (%)" value={formatPercent(totals.markupPercent, 2)} />
          <Row
            label="MARGEM LIQUIDA (%)"
            value={formatPercent(totals.marginPercent, 2)}
            tone={
              totals.marginPercent >= MINIMUM_MARGIN_TARGET
                ? "success"
                : totals.marginPercent >= ATTENTION_MARGIN_TARGET
                  ? "warning"
                  : "danger"
            }
            bold
          />
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Despesas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {expenseBreakdown.length === 0 ? (
            <p className="text-muted-foreground">Sem despesas registradas.</p>
          ) : (
            expenseBreakdown.map((item) => (
              <div key={item.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                <span>{item.name}</span>
                <span className="font-medium">{formatPrecisePercent(item.percent)}</span>
                <span className="font-medium">{formatCurrency(item.value)}</span>
              </div>
            ))
          )}
          {expenseBreakdown.length > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-border pt-2 font-semibold">
              <span>TOTAL</span>
              <span>{formatPrecisePercent(expensePercentTotal)}</span>
              <span>{formatCurrency(totals.expenses)}</span>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-primary/30 bg-primary-soft/50 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <TrendingUp className="h-4 w-4" /> Recomendação
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground">
          {totals.viability === "Viável" && "Margem dentro do alvo. Pronta para aprovação."}
          {totals.viability === "Atenção" && "Margem em zona de alerta. Avalie redução de custos."}
          {totals.viability === "Inviável" &&
            "Reveja preços ou negocie custos antes de prosseguir."}
          {totals.viability === "Pendente" && "Adicione produtos para calcular a viabilidade."}
        </CardContent>
      </Card>
    </aside>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "success" | "warning" | "danger";
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${toneCls}`}>{value}</span>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const cls = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <div className={`rounded-2xl p-4 ${cls}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <CheckCircle2 className="mt-2 h-4 w-4 opacity-60" />
    </div>
  );
}
