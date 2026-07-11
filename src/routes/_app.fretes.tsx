import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MapPin,
  Plus,
  RotateCw,
  Save,
  Truck,
  Upload,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppContext } from "@/features/app/app-context";
import type {
  FinancialTitle,
  FreightCargoType,
  FreightDriverEmploymentType,
  FreightRecord,
  Order,
  SimulationProduct,
} from "@/data/types";
import {
  createFreightFromOrder,
  getFreightStatusLabel,
  getNextFreightStatus,
  updateOrderFromFreight,
} from "@/features/freights/freightHelpers";
import {
  FREIGHT_DOCUMENT_TYPE_LABEL,
  getFreightDocumentSignedUrl,
  listFreightDocuments,
  saveFreightDocument,
  validateFreightDocumentFile,
  type FreightDocumentRecord,
  type FreightDocumentType,
} from "@/features/freights/freightDocumentStorage";
import {
  FREIGHT_CARGO_TYPE_LABEL,
  FREIGHT_CHECKLIST_CATALOG,
  getBlockItems,
  getChecklistStatus,
  isRequiredForCargo,
  type FreightChecklistBlock,
  type FreightChecklistItem,
  type FreightChecklistStatus,
} from "@/features/freights/freightChecklist";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  DRIVER_EVENT_FLOW,
  createDriverAccessLink,
  fetchDriverAccessSummary,
  getDeliveryProofSignedUrl,
  revokeDriverAccessLink,
  type DriverAccessSummary,
  type GeneratedDriverAccess,
} from "@/lib/driverTracking";
import { filterFreightsForUser, filterOrdersForUser } from "@/lib/visibility";
import { canOperateFreight } from "@/lib/permissions";
import { useAppStore } from "@/store/useAppStore";
import {
  FREIGHT_BUCKET_LABEL,
  getFreightBucket,
  getPreparationBlockedReason,
  getPreparationStageLabel,
  isPreparationFreight,
  type FreightBucket,
} from "@/features/freights/freightPreparation";
import { getOrderBillingLabel } from "@/features/orders/orderStatus";
import { toast } from "sonner";
import {
  createFreightWalletEntry,
  reverseEntriesByReference,
  upsertWalletEntry,
} from "@/features/negotiation-wallets";
import {
  buildFreightPayableTitle,
  buildFreightPayableTitleId,
  getFreightReleaseStatusLabel,
  isOrderFinanciallyReleased,
} from "@/features/finance/financialTitleHelpers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/fretes")({
  component: FreightsPage,
});

type FreightFormState = {
  carrierName: string;
  carrierDocument: string;
  driverName: string;
  driverCpf: string;
  driverPhone: string;
  driverEmploymentType: FreightDriverEmploymentType | "";
  vehicleDescription: string;
  vehiclePlate: string;
  trailerPlate: string;
  anttRegistration: string;
  cargoType: FreightCargoType;
  route: string;
  freightValue: string;
  pickupDate: string;
  expectedDeliveryDate: string;
  freightPaymentDueDate: string;
  notes: string;
};

function FreightsPage() {
  const {
    auth,
    orders,
    simulations,
    financialTitles,
    freights,
    negotiationWallets,
    upsertFreight,
    upsertOrder,
    upsertFinancialTitle,
    upsertNegotiationWallet,
  } = useAppContext();
  const addNotification = useAppStore((store) => store.addNotification);
  const addAuditEvents = useAppStore((store) => store.addAuditEvents);
  // Só Frete/Logística e Admin operam o frete (contratar, avançar, gerar link/PIN).
  // Financeiro tem apenas visualização.
  const canOperate = canOperateFreight(auth.user);
  const [selectedFreightId, setSelectedFreightId] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState<FreightBucket | "all">("all");
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleFreights = useMemo(
    () => filterFreightsForUser(freights, orders, auth.user),
    [auth.user, freights, orders],
  );
  // Classifica cada frete visível em um "balde" (Preparação / Liberados / Em
  // andamento / Finalizados) para separar visualmente as operações que ainda não
  // podem ser executadas das que já estão liberadas.
  const bucketByFreightId = useMemo(() => {
    const map = new Map<string, FreightBucket>();
    visibleFreights.forEach((freight) => {
      const order = orders.find((item) => item.id === freight.orderId);
      map.set(freight.id, getFreightBucket(freight, order, financialTitles));
    });
    return map;
  }, [visibleFreights, orders, financialTitles]);
  const bucketCounts = useMemo(() => {
    const counts: Record<FreightBucket, number> = {
      preparation: 0,
      released: 0,
      in_progress: 0,
      finished: 0,
    };
    bucketByFreightId.forEach((bucket) => {
      counts[bucket] += 1;
    });
    return counts;
  }, [bucketByFreightId]);
  const filteredFreights = useMemo(
    () =>
      bucketFilter === "all"
        ? visibleFreights
        : visibleFreights.filter((freight) => bucketByFreightId.get(freight.id) === bucketFilter),
    [bucketFilter, visibleFreights, bucketByFreightId],
  );
  const total = visibleFreights.length;
  const transit = visibleFreights.filter((f) => f.status === "in_route").length;
  const value = visibleFreights.reduce((s, f) => s + f.freightValue, 0);
  const selectedFreight = visibleFreights.find((freight) => freight.id === selectedFreightId);
  const selectedOrder = orders.find((order) => order.id === selectedFreight?.orderId);
  // Resumo da carga (§11): produtos/QTD.(CX) vêm do pedido vinculado ou, na
  // preparação, da simulação de origem.
  const selectedFreightSimulation = simulations.find(
    (simulation) => simulation.number === selectedFreight?.orderNumber,
  );
  const cargoProducts = selectedOrder?.products ?? selectedFreightSimulation?.products ?? [];
  const cargoSupplier = selectedFreightSimulation?.supplier;
  const [form, setForm] = useState<FreightFormState>(() => createFreightFormState());
  const [documents, setDocuments] = useState<FreightDocumentRecord[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [driverAccess, setDriverAccess] = useState<DriverAccessSummary | null>(null);
  const [driverAccessLoading, setDriverAccessLoading] = useState(false);
  const [generatedDriverAccess, setGeneratedDriverAccess] = useState<GeneratedDriverAccess | null>(
    null,
  );

  const refreshDriverAccess = useCallback(async (freight: FreightRecord) => {
    setDriverAccessLoading(true);
    try {
      const summary = await fetchDriverAccessSummary(freight);
      setDriverAccess(summary);
    } catch {
      setDriverAccess(null);
    } finally {
      setDriverAccessLoading(false);
    }
  }, []);

  const refreshFreightDocuments = useCallback(async (freightId: string) => {
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const nextDocuments = await listFreightDocuments(freightId);
      setDocuments(nextDocuments);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível carregar os documentos.";
      setDocumentsError(message);
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedFreight && visibleFreights.length > 0 && selectedFreightId) {
      setSelectedFreightId(null);
    }
  }, [selectedFreight, selectedFreightId, visibleFreights.length]);

  // Chaveamos pelos ids (não pelo objeto) para o auto-refresh (polling) não resetar
  // o formulário nem re-buscar documentos a cada ciclo enquanto o mesmo frete está aberto.
  useEffect(() => {
    if (!selectedFreight) {
      setForm(createFreightFormState());
      return;
    }
    setForm(createFreightFormState(selectedFreight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFreightId]);

  useEffect(() => {
    if (!selectedFreight) {
      setDocuments([]);
      setDocumentsError(null);
      setDriverAccess(null);
      setGeneratedDriverAccess(null);
      return;
    }

    void refreshFreightDocuments(selectedFreight.id);
    void refreshDriverAccess(selectedFreight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFreightId, refreshDriverAccess, refreshFreightDocuments]);

  // Auto-gera o registro de frete para pedidos JÁ LIBERADOS que ainda não têm frete,
  // para que apareçam na tela sem depender do botão "Gerar". Restrito a pedidos
  // liberados (não gera para pedidos apenas confirmados, que ainda dependem do financeiro).
  useEffect(() => {
    const released = visibleOrders.filter(
      (order) =>
        (order.status === "Frete liberado" || order.status === "Aguardando frete") &&
        !freights.some((freight) => freight.orderId === order.id),
    );
    released.forEach((order) => upsertFreight(createFreightFromOrder(order)));
  }, [visibleOrders, freights, upsertFreight]);

  const checklistStatus = useMemo(
    () => (selectedFreight ? getChecklistStatus(selectedFreight, documents) : null),
    [documents, selectedFreight],
  );

  const syncFreightPayableTitle = useCallback(
    (freight: FreightRecord, order?: Order) => {
      if (freight.freightValue <= 0 || !freight.freightPaymentDueDate) return;
      const existing = financialTitles.find(
        (title) =>
          title.id === (freight.freightPaymentTitleId || buildFreightPayableTitleId(freight)),
      );
      const nextTitle = buildFreightPayableTitle(freight, order, existing);
      if (!nextTitle) return;
      upsertFinancialTitle(nextTitle);
      if (freight.freightPaymentTitleId !== nextTitle.id) {
        upsertFreight({ ...freight, freightPaymentTitleId: nextTitle.id });
      }
    },
    [financialTitles, upsertFinancialTitle, upsertFreight],
  );

  const handleAdvanceFreight = (freight: FreightRecord, force = false) => {
    if (!canOperate) {
      toast.error("Seu perfil pode acompanhar o frete, mas não pode contratar/operar.");
      return;
    }
    const order = orders.find((item) => item.id === freight.orderId);
    if (!isOrderFinanciallyReleased(order, financialTitles)) {
      toast.warning("Frete ainda em preparação (pedido não confirmado). Aguarde a liberação.");
      return;
    }

    const status = getChecklistStatus(freight, documents);

    // Gate para primeira contratação
    if (!force && freight.status === "quoted" && !status.canContract) {
      toast.warning(
        `Faltam documentos obrigatórios para contratar: ${status.missingForContract.slice(0, 3).join(", ")}${status.missingForContract.length > 3 ? "…" : ""}`,
      );
      return;
    }

    // Gate para acionar motorista (loading)
    if (!force && freight.status === "hired" && !status.canReleaseDriver) {
      toast.warning(
        `Faltam documentos para liberar o motorista: ${status.missingForRelease.slice(0, 3).join(", ")}${status.missingForRelease.length > 3 ? "…" : ""}`,
      );
      return;
    }

    // Gate para finalizar entrega
    if (!force && freight.status === "in_route" && !status.canFinalize) {
      toast.warning("Anexe o canhoto/comprovante de entrega antes de finalizar.");
      return;
    }

    const nextStatus = getNextFreightStatus(freight.status);
    if (nextStatus === freight.status) return;

    const nextFreight: FreightRecord = {
      ...freight,
      status: nextStatus,
      deliveredAt: nextStatus === "delivered" ? new Date().toISOString() : freight.deliveredAt,
    };
    upsertFreight(nextFreight);

    if (order) upsertOrder(updateOrderFromFreight(order, nextFreight));

    // §7/§15/§16 — Contratação do frete (quoted → hired): "Frete contratado",
    // notifica Comercial e Financeiro e registra auditoria.
    if (freight.status === "quoted" && nextStatus === "hired") {
      const now = new Date().toISOString();
      const ref = order?.number ?? freight.orderNumber ?? freight.code;
      addNotification({
        id: `not-${Date.now()}-contract-com`,
        title: "Frete contratado",
        description: `${ref}: frete contratado (${nextFreight.carrierName || "transportadora a definir"}).`,
        type: "success",
        createdAt: now,
        unread: true,
        entityType: "order",
        entityId: order?.id ?? freight.id,
        targetUserName: freight.owner,
      });
      addNotification({
        id: `not-${Date.now()}-contract-fin`,
        title: "Frete contratado",
        description: `${ref}: frete contratado pelo time de Logística.`,
        type: "info",
        createdAt: now,
        unread: true,
        entityType: "order",
        entityId: order?.id ?? freight.id,
        targetRole: "Financeiro",
      });
      addAuditEvents([
        {
          id: `aud-${now}-freight-hired-${freight.id}`,
          entityType: "order",
          entityId: order?.id ?? freight.id,
          action: "freight_contracted",
          description: `${ref}: frete contratado (${nextFreight.carrierName || "transportadora a definir"}).`,
          userId: auth.user?.id ?? "system",
          createdAt: now,
          metadata: { role: auth.user?.role ?? "Frete", freightCode: freight.code },
        },
      ]);
    }

    toast.success(`Frete atualizado para ${getFreightStatusLabel(nextStatus)}.`);
  };

  const updateForm = (key: keyof FreightFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSaveFreightDetails = () => {
    if (!selectedFreight) return;

    const nextFreight: FreightRecord = {
      ...selectedFreight,
      carrierName: form.carrierName.trim() || "Transportadora a definir",
      carrierDocument: form.carrierDocument.trim() || undefined,
      driverName: form.driverName.trim(),
      driverCpf: form.driverCpf.trim() || undefined,
      driverPhone: form.driverPhone.trim() || undefined,
      driverEmploymentType: form.driverEmploymentType || undefined,
      vehicleDescription: form.vehicleDescription.trim() || "Veículo a definir",
      vehiclePlate: form.vehiclePlate.trim().toUpperCase(),
      trailerPlate: form.trailerPlate.trim().toUpperCase() || undefined,
      anttRegistration: form.anttRegistration.trim() || undefined,
      cargoType: form.cargoType,
      route: form.route.trim() || selectedFreight.route,
      freightValue: parseDecimalInput(form.freightValue),
      pickupDate: fromDateTimeInput(form.pickupDate, selectedFreight.pickupDate),
      expectedDeliveryDate: fromDateTimeInput(
        form.expectedDeliveryDate,
        selectedFreight.expectedDeliveryDate,
      ),
      freightPaymentDueDate: fromDateInputOptional(form.freightPaymentDueDate),
      notes: form.notes.trim(),
    };

    upsertFreight(nextFreight);
    syncFreightPayableTitle(nextFreight, selectedOrder);

    const wallet = negotiationWallets.find((item) => item.orderId === nextFreight.orderId);
    const order = orders.find((item) => item.id === nextFreight.orderId);
    const simulation = simulations.find((item) => item.id === order?.simulationId);
    if (wallet) {
      const reversedWallet = reverseEntriesByReference(wallet, nextFreight.id, auth.user);
      const entry = createFreightWalletEntry({
        wallet: reversedWallet,
        simulation,
        freight: nextFreight,
        user: auth.user,
      });
      upsertNegotiationWallet(entry ? upsertWalletEntry(reversedWallet, entry) : reversedWallet);
    }

    toast.success("Dados do frete salvos.");
  };

  const handleUploadFreightDocument = async ({
    type,
    file,
    notes,
  }: {
    type: FreightDocumentType;
    file: File;
    notes: string;
  }) => {
    if (!selectedFreight) return;
    const document = await saveFreightDocument({ freight: selectedFreight, type, file, notes });
    setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
    toast.success("Documento do frete anexado.");
  };

  const handleOpenFreightDocument = async (document: FreightDocumentRecord) => {
    if (!document.filePath) {
      toast.info("Documento registrado localmente, sem arquivo salvo no Supabase.");
      return;
    }
    try {
      const url = await getFreightDocumentSignedUrl(document.filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível abrir o documento.";
      toast.error(message);
    }
  };

  const handleGenerateDriverAccess = async () => {
    if (!selectedFreight) return;
    if (!canOperate) {
      toast.error("Seu perfil não pode gerar o link/PIN do motorista.");
      return;
    }
    const order = orders.find((item) => item.id === selectedFreight.orderId);
    if (!isOrderFinanciallyReleased(order, financialTitles)) {
      toast.warning("Operação em preparação. Aguarde o pedido ser confirmado.");
      return;
    }
    if (checklistStatus && !checklistStatus.canReleaseDriver) {
      toast.warning(
        "Complete os documentos obrigatórios (motorista, veículo e operação) antes de gerar o link.",
      );
      return;
    }

    try {
      const access = await createDriverAccessLink(selectedFreight);
      setGeneratedDriverAccess(access);
      await refreshDriverAccess(selectedFreight);
      toast.success("Acesso do motorista gerado. Copie o link e o PIN.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível gerar o acesso do motorista.";
      toast.error(message);
    }
  };

  const handleRevokeDriverAccess = async () => {
    if (!selectedFreight) return;
    try {
      await revokeDriverAccessLink(selectedFreight);
      setGeneratedDriverAccess(null);
      await refreshDriverAccess(selectedFreight);
      toast.success("Acesso do motorista revogado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível revogar o acesso.";
      toast.error(message);
    }
  };

  const handleOpenDriverProof = async (filePath: string) => {
    try {
      const url = await getDeliveryProofSignedUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível abrir o comprovante.";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fretes"
        description="Contratação, checklist de documentos e rastreamento de fretes."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Fretes ativos" value={String(total)} icon={Truck} tone="info" />
        <StatCard label="Em rota" value={String(transit)} icon={MapPin} tone="warning" />
        <StatCard
          label="Valor contratado"
          value={formatCurrency(value)}
          icon={Truck}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="shadow-card">
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Painel de fretes</CardTitle>
            <Tabs
              value={bucketFilter}
              onValueChange={(value) => setBucketFilter(value as FreightBucket | "all")}
            >
              <TabsList className="w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="all">Todos ({total})</TabsTrigger>
                <TabsTrigger value="preparation">
                  {FREIGHT_BUCKET_LABEL.preparation} ({bucketCounts.preparation})
                </TabsTrigger>
                <TabsTrigger value="released">
                  {FREIGHT_BUCKET_LABEL.released} ({bucketCounts.released})
                </TabsTrigger>
                <TabsTrigger value="in_progress">
                  {FREIGHT_BUCKET_LABEL.in_progress} ({bucketCounts.in_progress})
                </TabsTrigger>
                <TabsTrigger value="finished">
                  {FREIGHT_BUCKET_LABEL.finished} ({bucketCounts.finished})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredFreights.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                {bucketFilter === "preparation"
                  ? "Nenhuma operação em preparação. Simulações aprovadas pelo Gestor aparecem aqui antes de virar pedido."
                  : "Nenhum frete nesta lista no momento."}
              </div>
            ) : null}
            {filteredFreights.map((freight) => {
              const order = orders.find((item) => item.id === freight.orderId);
              const status = getChecklistStatus(
                freight,
                selectedFreightId === freight.id ? documents : [],
              );
              const preparation = isPreparationFreight(freight);
              const releaseLabel = preparation
                ? getPreparationStageLabel(freight, order)
                : getFreightReleaseStatusLabel(order, financialTitles);
              return (
                <button
                  key={freight.id}
                  type="button"
                  onClick={() => setSelectedFreightId(freight.id)}
                  className={cn(
                    "w-full rounded-2xl border p-3 text-left transition hover:border-primary/60 hover:bg-muted/40",
                    selectedFreightId === freight.id && "border-primary bg-primary-soft",
                    preparation && "border-dashed border-warning/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{freight.code}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {freight.orderNumber ?? "-"} • {freight.client}
                      </p>
                    </div>
                    <StatusBadge status={getFreightStatusLabel(freight.status)} />
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">{freight.route}</p>
                  {preparation ? (
                    <p className="mt-1 text-[11px] font-medium text-warning">
                      Ainda não virou pedido • bloqueada para execução
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full",
                        preparation && "border-warning/40 text-warning",
                      )}
                    >
                      {releaseLabel}
                    </Badge>
                    <span className="text-muted-foreground">
                      {selectedFreightId === freight.id
                        ? `${status.driverCount.done + status.vehicleCount.done + status.operationCount.done}/${status.driverCount.total + status.vehicleCount.total + status.operationCount.total} docs`
                        : formatCurrency(freight.freightValue)}
                    </span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!selectedFreight ? (
            <Card className="shadow-card">
              <CardContent className="flex min-h-[320px] items-center justify-center p-6 text-sm text-muted-foreground">
                Selecione um frete à esquerda para ver dados, checklist e ações.
              </CardContent>
            </Card>
          ) : (
            <FreightDetailPanel
              freight={selectedFreight}
              order={selectedOrder}
              financialTitles={financialTitles}
              canOperate={canOperate}
              cargoProducts={cargoProducts}
              cargoSupplier={cargoSupplier}
              form={form}
              onChangeForm={updateForm}
              onSaveForm={handleSaveFreightDetails}
              documents={documents}
              documentsLoading={documentsLoading}
              documentsError={documentsError}
              checklist={checklistStatus}
              onUploadDocument={handleUploadFreightDocument}
              onOpenDocument={handleOpenFreightDocument}
              onAdvance={handleAdvanceFreight}
              driverAccess={driverAccess}
              driverAccessLoading={driverAccessLoading}
              generatedDriverAccess={generatedDriverAccess}
              onGenerateDriverAccess={handleGenerateDriverAccess}
              onRevokeDriverAccess={handleRevokeDriverAccess}
              onOpenDriverProof={handleOpenDriverProof}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FreightDetailPanel({
  freight,
  order,
  financialTitles,
  canOperate,
  cargoProducts,
  cargoSupplier,
  form,
  onChangeForm,
  onSaveForm,
  documents,
  documentsLoading,
  documentsError,
  checklist,
  onUploadDocument,
  onOpenDocument,
  onAdvance,
  driverAccess,
  driverAccessLoading,
  generatedDriverAccess,
  onGenerateDriverAccess,
  onRevokeDriverAccess,
  onOpenDriverProof,
}: {
  freight: FreightRecord;
  order?: Order;
  financialTitles: FinancialTitle[];
  canOperate: boolean;
  cargoProducts: SimulationProduct[];
  cargoSupplier?: string;
  form: FreightFormState;
  onChangeForm: (key: keyof FreightFormState, value: string) => void;
  onSaveForm: () => void;
  documents: FreightDocumentRecord[];
  documentsLoading: boolean;
  documentsError: string | null;
  checklist: FreightChecklistStatus | null;
  onUploadDocument: (payload: {
    type: FreightDocumentType;
    file: File;
    notes: string;
  }) => Promise<void>;
  onOpenDocument: (document: FreightDocumentRecord) => void;
  onAdvance: (freight: FreightRecord) => void;
  driverAccess: DriverAccessSummary | null;
  driverAccessLoading: boolean;
  generatedDriverAccess: GeneratedDriverAccess | null;
  onGenerateDriverAccess: () => void;
  onRevokeDriverAccess: () => void;
  onOpenDriverProof: (filePath: string) => void;
}) {
  const financiallyReleased = isOrderFinanciallyReleased(order, financialTitles);
  const paymentTitle = financialTitles.find(
    (title) => title.id === (freight.freightPaymentTitleId || buildFreightPayableTitleId(freight)),
  );
  const advanceDisabled =
    !canOperate ||
    !financiallyReleased ||
    freight.status === "delivered" ||
    freight.status === "cancelled";
  const advanceLabel = getAdvanceLabel(freight.status);
  const preparation = isPreparationFreight(freight);

  return (
    <>
      {preparation ? (
        <div className="rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <p className="font-semibold">Operação em preparação</p>
          <p className="mt-1 text-warning/90">{getPreparationBlockedReason(freight, order)}</p>
          <p className="mt-2 text-xs text-warning/80">
            Você pode preparar dados (transportadora, veículo, rota, observações), mas a contratação
            oficial, a geração de link/PIN do motorista e o avanço operacional ficam bloqueados até
            a liberação.
          </p>
        </div>
      ) : null}
      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>
              {freight.code}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {freight.orderNumber ?? "-"} • {freight.client}
              </span>
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{freight.route}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={getFreightStatusLabel(freight.status)} />
            <StatusBadge status={getFreightReleaseStatusLabel(order, financialTitles)} />
            {order ? (
              <Badge variant="outline" className="rounded-full text-muted-foreground">
                Faturamento: {getOrderBillingLabel(order)}
              </Badge>
            ) : null}
            <Button size="sm" onClick={() => onAdvance(freight)} disabled={advanceDisabled}>
              <ArrowRight />
              {advanceLabel}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <StatusPill
            label="Motorista"
            done={checklist?.driverCount.done ?? 0}
            total={checklist?.driverCount.total ?? 0}
            ready={checklist?.driverReady ?? false}
          />
          <StatusPill
            label="Veículo"
            done={checklist?.vehicleCount.done ?? 0}
            total={checklist?.vehicleCount.total ?? 0}
            ready={checklist?.vehicleReady ?? false}
          />
          <StatusPill
            label="Operação"
            done={checklist?.operationCount.done ?? 0}
            total={checklist?.operationCount.total ?? 0}
            ready={checklist?.operationReady ?? false}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList className="w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="summary">Resumo</TabsTrigger>
          <TabsTrigger value="driver">Motorista</TabsTrigger>
          <TabsTrigger value="vehicle">Veículo</TabsTrigger>
          <TabsTrigger value="operation">Operação</TabsTrigger>
          <TabsTrigger value="payment">Pagamento</TabsTrigger>
          <TabsTrigger value="tracking">Rastreamento</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          <CargoSummaryCard freight={freight} supplier={cargoSupplier} products={cargoProducts} />
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Dados do frete</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Transportadora">
                  <Input
                    value={form.carrierName}
                    onChange={(event) => onChangeForm("carrierName", event.target.value)}
                    placeholder="Nome da transportadora"
                  />
                </Field>
                <Field label="CNPJ/CPF da transportadora">
                  <Input
                    value={form.carrierDocument}
                    onChange={(event) => onChangeForm("carrierDocument", event.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </Field>
                <Field label="Tipo de carga">
                  <Select
                    value={form.cargoType}
                    onValueChange={(value) => onChangeForm("cargoType", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREIGHT_CARGO_TYPE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Trajeto">
                  <Input
                    value={form.route}
                    onChange={(event) => onChangeForm("route", event.target.value)}
                  />
                </Field>
                <Field label="Carregamento">
                  <Input
                    type="datetime-local"
                    value={form.pickupDate}
                    onChange={(event) => onChangeForm("pickupDate", event.target.value)}
                  />
                </Field>
                <Field label="Previsão de entrega">
                  <Input
                    type="datetime-local"
                    value={form.expectedDeliveryDate}
                    onChange={(event) => onChangeForm("expectedDeliveryDate", event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Observações">
                <Textarea
                  value={form.notes}
                  onChange={(event) => onChangeForm("notes", event.target.value)}
                  placeholder="Instruções para coleta, contatos, restrições operacionais."
                />
              </Field>
              <div className="flex justify-end">
                <Button onClick={onSaveForm}>
                  <Save />
                  Salvar dados
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="driver" className="mt-4 space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Dados do motorista</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Nome">
                <Input
                  value={form.driverName}
                  onChange={(event) => onChangeForm("driverName", event.target.value)}
                />
              </Field>
              <Field label="CPF">
                <Input
                  value={form.driverCpf}
                  onChange={(event) => onChangeForm("driverCpf", event.target.value)}
                  placeholder="000.000.000-00"
                />
              </Field>
              <Field label="Telefone / WhatsApp">
                <Input
                  value={form.driverPhone}
                  onChange={(event) => onChangeForm("driverPhone", event.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </Field>
              <Field label="Vínculo">
                <Select
                  value={form.driverEmploymentType || ""}
                  onValueChange={(value) => onChangeForm("driverEmploymentType", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="autonomo">Autônomo (TAC)</SelectItem>
                    <SelectItem value="transportadora">Transportadora</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-end md:col-span-3">
                <Button onClick={onSaveForm} variant="outline">
                  <Save />
                  Salvar dados do motorista
                </Button>
              </div>
            </CardContent>
          </Card>
          <ChecklistBlock
            title="Documentos do motorista"
            block="driver"
            freight={freight}
            documents={documents}
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            onUploadDocument={onUploadDocument}
            onOpenDocument={onOpenDocument}
          />
        </TabsContent>

        <TabsContent value="vehicle" className="mt-4 space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Dados do veículo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Descrição">
                <Input
                  value={form.vehicleDescription}
                  onChange={(event) => onChangeForm("vehicleDescription", event.target.value)}
                  placeholder="Truck, carreta, baú..."
                />
              </Field>
              <Field label="Placa do cavalo/caminhão">
                <Input
                  value={form.vehiclePlate}
                  onChange={(event) => onChangeForm("vehiclePlate", event.target.value)}
                  placeholder="ABC-1D23"
                />
              </Field>
              <Field label="Placa da carreta">
                <Input
                  value={form.trailerPlate}
                  onChange={(event) => onChangeForm("trailerPlate", event.target.value)}
                  placeholder="Se houver"
                />
              </Field>
              <Field label="RNTRC / ANTT">
                <Input
                  value={form.anttRegistration}
                  onChange={(event) => onChangeForm("anttRegistration", event.target.value)}
                  placeholder="Registro na ANTT"
                />
              </Field>
              <div className="flex items-end md:col-span-3">
                <Button onClick={onSaveForm} variant="outline">
                  <Save />
                  Salvar dados do veículo
                </Button>
              </div>
            </CardContent>
          </Card>
          <ChecklistBlock
            title="Documentos do veículo"
            block="vehicle"
            freight={freight}
            documents={documents}
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            onUploadDocument={onUploadDocument}
            onOpenDocument={onOpenDocument}
          />
        </TabsContent>

        <TabsContent value="operation" className="mt-4">
          <ChecklistBlock
            title="Documentos da operação"
            block="operation"
            freight={freight}
            documents={documents}
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            onUploadDocument={onUploadDocument}
            onOpenDocument={onOpenDocument}
          />
          {/* "Entrega final/Canhoto" removido da Operação: o comprovante de entrega
              é responsabilidade do motorista, na seção de Rastreamento. */}
        </TabsContent>

        <TabsContent value="payment" className="mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Pagamento ao transportador</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Valor do frete (R$)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.freightValue}
                    onChange={(event) => onChangeForm("freightValue", event.target.value)}
                  />
                </Field>
                <Field label="Data prevista de pagamento">
                  <Input
                    type="date"
                    value={form.freightPaymentDueDate}
                    onChange={(event) => onChangeForm("freightPaymentDueDate", event.target.value)}
                  />
                </Field>
                <div className="flex items-end">
                  <Button onClick={onSaveForm}>
                    <Save />
                    Gerar / atualizar conta a pagar
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                {paymentTitle ? (
                  <>
                    <p className="font-semibold">
                      Título {paymentTitle.titleNumber} — {formatCurrency(paymentTitle.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vencimento {formatDate(paymentTitle.dueDate)} • status {paymentTitle.status}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A conta a pagar é atualizada automaticamente quando o valor ou a data mudam.
                      Financeiro faz a baixa na tela dele.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Ainda não gerado. Informe valor e data e salve para criar a conta a pagar do
                    frete.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="mt-4">
          <DriverAccessCard
            freight={freight}
            order={order}
            financialTitles={financialTitles}
            canOperate={canOperate}
            checklist={checklist}
            access={driverAccess}
            generatedAccess={generatedDriverAccess}
            loading={driverAccessLoading}
            onGenerate={onGenerateDriverAccess}
            onRevoke={onRevokeDriverAccess}
            onOpenProof={onOpenDriverProof}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function CargoSummaryCard({
  freight,
  supplier,
  products,
}: {
  freight: FreightRecord;
  supplier?: string;
  products: SimulationProduct[];
}) {
  const totalBoxes = products.reduce((sum, product) => sum + (product.boxes ?? 0), 0);
  const totalUnits = products.reduce((sum, product) => sum + (product.quantityTotal ?? 0), 0);
  const [origin, destination] = freight.route.split("→").map((part) => part.trim());
  const pairs: Array<[string, string]> = [
    ["Cliente", freight.client || "—"],
    ["Fornecedor", supplier || "—"],
    ["Origem", origin || freight.unit || "—"],
    ["Destino", destination || "—"],
    ["Previsão de coleta", freight.pickupDate ? formatDateTime(freight.pickupDate) : "—"],
    [
      "Previsão de entrega",
      freight.expectedDeliveryDate ? formatDateTime(freight.expectedDeliveryDate) : "—",
    ],
  ];
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Resumo da carga</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pairs.map(([label, value]) => (
            <div key={label} className="space-y-0.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
        {products.length ? (
          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Produto</span>
              <span className="text-right">QTD.(CX)</span>
              <span className="text-right">Qtd. total</span>
            </div>
            {products.map((product) => (
              <div
                key={product.id}
                className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-3 py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{product.product}</p>
                  {product.code ? (
                    <p className="truncate text-xs text-muted-foreground">{product.code}</p>
                  ) : null}
                </div>
                <span className="text-right">{(product.boxes ?? 0).toLocaleString("pt-BR")}</span>
                <span className="text-right">
                  {(product.quantityTotal ?? 0).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-muted/40 px-3 py-2 text-sm font-semibold">
              <span>Total</span>
              <span className="text-right">{totalBoxes.toLocaleString("pt-BR")}</span>
              <span className="text-right">{totalUnits.toLocaleString("pt-BR")}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem itens de carga informados.</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({
  label,
  done,
  total,
  ready,
}: {
  label: string;
  done: number;
  total: number;
  ready: boolean;
}) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="rounded-2xl border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("text-xs", ready ? "text-success" : "text-muted-foreground")}>
          {done}/{total}
        </span>
      </div>
      <Progress value={percent} className="mt-2 h-1.5" />
    </div>
  );
}

function ChecklistBlock({
  title,
  block,
  freight,
  documents,
  documentsLoading,
  documentsError,
  onUploadDocument,
  onOpenDocument,
}: {
  title: string;
  block: FreightChecklistBlock;
  freight: FreightRecord;
  documents: FreightDocumentRecord[];
  documentsLoading: boolean;
  documentsError: string | null;
  onUploadDocument: (payload: {
    type: FreightDocumentType;
    file: File;
    notes: string;
  }) => Promise<void>;
  onOpenDocument: (document: FreightDocumentRecord) => void;
}) {
  const items = getBlockItems(block, freight.cargoType);
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {documentsError ? (
          <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
            {documentsError}
          </p>
        ) : null}
        {documentsLoading ? (
          <p className="text-sm text-muted-foreground">Carregando documentos...</p>
        ) : null}
        {items.map((item) => (
          <ChecklistRow
            key={item.type}
            item={item}
            freight={freight}
            attached={documents.filter((doc) => doc.type === item.type)}
            onUploadDocument={onUploadDocument}
            onOpenDocument={onOpenDocument}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ChecklistRow({
  item,
  freight,
  attached,
  onUploadDocument,
  onOpenDocument,
}: {
  item: FreightChecklistItem;
  freight: FreightRecord;
  attached: FreightDocumentRecord[];
  onUploadDocument: (payload: {
    type: FreightDocumentType;
    file: File;
    notes: string;
  }) => Promise<void>;
  onOpenDocument: (document: FreightDocumentRecord) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const required = isRequiredForCargo(item, freight.cargoType);
  const done = attached.length > 0;

  const handleFile = async (file?: File) => {
    if (!file) return;
    const validation = validateFreightDocumentFile(file);
    if (validation) {
      toast.error(validation);
      return;
    }
    setUploading(true);
    try {
      await onUploadDocument({ type: item.type, file, notes: "" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível anexar.";
      toast.error(message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {done ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-success" />
          ) : (
            <Circle
              className={cn(
                "mt-0.5 h-4 w-4 flex-none",
                required ? "text-warning" : "text-muted-foreground",
              )}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {item.label}
              {required ? (
                <Badge variant="outline" className="ml-2 rounded-full text-[10px]">
                  Obrigatório
                </Badge>
              ) : (
                <Badge variant="outline" className="ml-2 rounded-full text-[10px]">
                  Opcional
                </Badge>
              )}
            </p>
            {item.helper ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{item.helper}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <Button
            size="sm"
            variant={done ? "outline" : "soft"}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload />
            {uploading ? "..." : done ? "Substituir" : "Anexar"}
          </Button>
        </div>
      </div>
      {attached.length > 0 ? (
        <div className="mt-2 space-y-1">
          {attached.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onOpenDocument(doc)}
              disabled={!doc.filePath}
              className="flex w-full items-center justify-between gap-2 rounded-lg border bg-muted/40 px-2 py-1 text-left text-xs hover:bg-muted"
            >
              <span className="min-w-0 truncate">
                <ExternalLink className="mr-1 inline h-3 w-3" />
                {doc.fileName}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatDateTime(doc.createdAt)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DriverAccessCard({
  freight,
  order,
  financialTitles,
  canOperate,
  checklist,
  access,
  generatedAccess,
  loading,
  onGenerate,
  onRevoke,
  onOpenProof,
}: {
  freight?: FreightRecord;
  order?: Order;
  financialTitles: FinancialTitle[];
  canOperate: boolean;
  checklist: FreightChecklistStatus | null;
  access: DriverAccessSummary | null;
  generatedAccess: GeneratedDriverAccess | null;
  loading: boolean;
  onGenerate: () => void;
  onRevoke: () => void;
  onOpenProof: (filePath: string) => void;
}) {
  const [copying, setCopying] = useState<string | null>(null);
  const financiallyReleased = isOrderFinanciallyReleased(order, financialTitles);
  const canRelease = canOperate && financiallyReleased && (checklist?.canReleaseDriver ?? false);

  const copyText = async (label: string, value: string) => {
    setCopying(label);
    try {
      await navigator.clipboard?.writeText(value);
      toast.success(`${label} copiado.`);
    } finally {
      setCopying(null);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Acesso temporário do motorista</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3 rounded-2xl border p-4">
          {!freight ? null : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{freight.code}</p>
                  <p className="text-xs text-muted-foreground">
                    Motorista: {freight.driverName || "não informado"}
                  </p>
                </div>
                <Badge variant="outline">
                  {loading ? "Carregando" : accessStatusLabel(access)}
                </Badge>
              </div>

              {generatedAccess ? (
                <div className="space-y-3 rounded-xl border border-primary/30 bg-primary-soft p-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Link</p>
                    <p className="break-all text-sm">{generatedAccess.url}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">PIN</p>
                    <p className="text-2xl font-bold tracking-widest">{generatedAccess.pin}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={copying === "Link"}
                      onClick={() => copyText("Link", generatedAccess.url)}
                    >
                      <Copy />
                      Copiar link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={copying === "PIN"}
                      onClick={() => copyText("PIN", generatedAccess.pin)}
                    >
                      <Copy />
                      Copiar PIN
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                  Gere um novo acesso para copiar link e senha.
                </p>
              )}

              {!canRelease ? (
                <p className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
                  {!canOperate
                    ? "Seu perfil pode acompanhar, mas não pode gerar o link/PIN do motorista."
                    : isPreparationFreight(freight)
                      ? "Operação em preparação: o link/PIN do motorista só pode ser gerado após a proposta virar pedido."
                      : financiallyReleased
                        ? "Complete os documentos obrigatórios (motorista, veículo e operação) antes de gerar o link."
                        : "Aguardando confirmação do pedido."}
                </p>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="soft" disabled={!canRelease} onClick={onGenerate}>
                  <RotateCw />
                  Gerar novo acesso
                </Button>
                <Button
                  variant="outline"
                  disabled={!access || access.status !== "active"}
                  onClick={onRevoke}
                >
                  <XCircle />
                  Revogar
                </Button>
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <p>Expira: {access?.expiresAt ? formatDateTime(access.expiresAt) : "-"}</p>
                <p>Tentativas inválidas: {access?.failedAttempts ?? 0}</p>
                <p>Desbloqueio: {access?.lockedUntil ? formatDateTime(access.lockedUntil) : "-"}</p>
                <p>Concluído: {access?.completedAt ? formatDateTime(access.completedAt) : "-"}</p>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border p-4">
          <h3 className="font-semibold">Timeline do motorista</h3>
          {access?.events.length
            ? access.events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1 h-3 w-3 rounded-full bg-primary" />
                  <div>
                    <p className="font-medium">{event.eventLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(event.occurredAt)}
                      {event.latitude ? " • localização registrada" : ""}
                    </p>
                  </div>
                </div>
              ))
            : DRIVER_EVENT_FLOW.map((step) => (
                <div key={step.type} className="flex items-start gap-3 text-sm">
                  <div className="mt-1 h-3 w-3 rounded-full bg-muted" />
                  <div>
                    <p className="font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground">Pendente</p>
                  </div>
                </div>
              ))}

          {access?.proofs.length ? (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-semibold">Comprovante</p>
              {access.proofs.map((proof) => (
                <Button
                  key={proof.id}
                  variant="outline"
                  size="sm"
                  disabled={!proof.filePath}
                  onClick={() => onOpenProof(proof.filePath)}
                >
                  <Link2 />
                  {proof.fileName || "Abrir comprovante"}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Comprovante ainda não enviado.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function accessStatusLabel(access: DriverAccessSummary | null) {
  if (!access) return "Sem acesso";
  return (
    {
      active: "Ativo",
      expired: "Expirado",
      revoked: "Revogado",
      locked: "Bloqueado",
      completed: "Concluído",
    } satisfies Record<DriverAccessSummary["status"], string>
  )[access.status];
}

function getAdvanceLabel(status: FreightRecord["status"]) {
  switch (status) {
    case "quoted":
      return "Contratar";
    case "hired":
      return "Iniciar carregamento";
    case "loading":
      return "Iniciar rota";
    case "in_route":
      return "Finalizar entrega";
    case "delivered":
      return "Concluído";
    default:
      return "Avançar";
  }
}

function createFreightFormState(freight?: FreightRecord): FreightFormState {
  return {
    carrierName: freight?.carrierName ?? "",
    carrierDocument: freight?.carrierDocument ?? "",
    driverName: freight?.driverName ?? "",
    driverCpf: freight?.driverCpf ?? "",
    driverPhone: freight?.driverPhone ?? "",
    driverEmploymentType: freight?.driverEmploymentType ?? "",
    vehicleDescription: freight?.vehicleDescription ?? "",
    vehiclePlate: freight?.vehiclePlate ?? "",
    trailerPlate: freight?.trailerPlate ?? "",
    anttRegistration: freight?.anttRegistration ?? "",
    cargoType: freight?.cargoType ?? "comum",
    route: freight?.route ?? "",
    freightValue: freight ? String(freight.freightValue ?? 0) : "0",
    pickupDate: toDateTimeInput(freight?.pickupDate),
    expectedDeliveryDate: toDateTimeInput(freight?.expectedDeliveryDate),
    freightPaymentDueDate: toDateInput(freight?.freightPaymentDueDate),
    notes: freight?.notes ?? "",
  };
}

function toDateTimeInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeInput(value: string, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function toDateInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateInputOptional(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseDecimalInput(value: string): number {
  if (!value) return 0;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
