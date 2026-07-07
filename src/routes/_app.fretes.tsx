import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MapPin,
  Pencil,
  Plus,
  RotateCw,
  Save,
  Truck,
  Upload,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/features/app/app-context";
import type { FreightRecord } from "@/data/types";
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
import { belongsToUser, canViewAllFlows, filterOrdersForUser } from "@/lib/visibility";
import { toast } from "sonner";
import {
  createFreightWalletEntry,
  reverseEntriesByReference,
  upsertWalletEntry,
} from "@/features/negotiation-wallets";

export const Route = createFileRoute("/_app/fretes")({
  component: FreightsPage,
});

type FreightFormState = {
  carrierName: string;
  driverName: string;
  vehicleDescription: string;
  vehiclePlate: string;
  route: string;
  freightValue: string;
  pickupDate: string;
  expectedDeliveryDate: string;
  notes: string;
};

function FreightsPage() {
  const {
    auth,
    orders,
    simulations,
    freights,
    negotiationWallets,
    upsertFreight,
    upsertOrder,
    upsertNegotiationWallet,
  } = useAppContext();
  const [selectedFreightId, setSelectedFreightId] = useState<string | null>(null);
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleOrderIds = useMemo(
    () => new Set(visibleOrders.map((order) => order.id)),
    [visibleOrders],
  );
  const visibleFreights = useMemo(
    () =>
      freights.filter((freight) => {
        if (canViewAllFlows(auth.user)) return true;
        return (
          visibleOrderIds.has(freight.orderId ?? "") || belongsToUser(freight.owner, auth.user)
        );
      }),
    [auth.user, freights, visibleOrderIds],
  );
  const eligibleOrders = visibleOrders.filter(
    (order) =>
      order.status !== "Aguardando faturamento" &&
      order.status !== "Em faturamento" &&
      !freights.some((freight) => freight.orderId === order.id),
  );
  const total = visibleFreights.length;
  const transit = visibleFreights.filter((f) => f.status === "in_route").length;
  const value = visibleFreights.reduce((s, f) => s + f.freightValue, 0);
  const selectedFreight = visibleFreights.find((freight) => freight.id === selectedFreightId);
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

  useEffect(() => {
    if (!selectedFreight) {
      setForm(createFreightFormState());
      return;
    }
    setForm(createFreightFormState(selectedFreight));
  }, [selectedFreight]);

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
  }, [refreshDriverAccess, refreshFreightDocuments, selectedFreight]);

  const handleGenerateFreights = () => {
    if (eligibleOrders.length === 0) {
      toast.info("Não há pedidos liberados sem frete.");
      return;
    }

    eligibleOrders.forEach((order) => upsertFreight(createFreightFromOrder(order)));
    toast.success("Fretes gerados a partir dos pedidos liberados.");
  };

  const handleAdvanceFreight = (freight: FreightRecord) => {
    const nextStatus = getNextFreightStatus(freight.status);
    if (nextStatus === freight.status) return;

    const nextFreight: FreightRecord = {
      ...freight,
      status: nextStatus,
      deliveredAt: nextStatus === "delivered" ? new Date().toISOString() : freight.deliveredAt,
    };
    upsertFreight(nextFreight);

    const order = orders.find((item) => item.id === freight.orderId);
    if (order) upsertOrder(updateOrderFromFreight(order, nextFreight));

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
      driverName: form.driverName.trim(),
      vehicleDescription: form.vehicleDescription.trim() || "Veículo a definir",
      vehiclePlate: form.vehiclePlate.trim().toUpperCase(),
      route: form.route.trim() || selectedFreight.route,
      freightValue: parseDecimalInput(form.freightValue),
      pickupDate: fromDateTimeInput(form.pickupDate, selectedFreight.pickupDate),
      expectedDeliveryDate: fromDateTimeInput(
        form.expectedDeliveryDate,
        selectedFreight.expectedDeliveryDate,
      ),
      notes: form.notes.trim(),
    };

    upsertFreight(nextFreight);

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
      toast.info("Este documento foi registrado localmente, sem arquivo salvo no Supabase.");
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

  const columns: DataColumn<FreightRecord>[] = [
    { key: "code", header: "Frete", cell: (f) => <span className="font-semibold">{f.code}</span> },
    { key: "order", header: "Pedido", cell: (f) => f.orderNumber ?? "-" },
    { key: "carrier", header: "Transportadora", cell: (f) => f.carrierName },
    {
      key: "vehicle",
      header: "Veículo",
      cell: (f) => (
        <Badge variant="outline" className="rounded-full">
          {f.vehicleDescription}
        </Badge>
      ),
    },
    {
      key: "route",
      header: "Trajeto",
      cell: (f) => <span className="text-sm text-muted-foreground">{f.route}</span>,
    },
    { key: "weight", header: "Volume", cell: (f) => f.weight },
    {
      key: "value",
      header: "Valor",
      className: "text-right",
      cell: (f) => <span className="font-medium">{formatCurrency(f.freightValue)}</span>,
    },
    { key: "loading", header: "Carregamento", cell: (f) => formatDate(f.pickupDate) },
    {
      key: "status",
      header: "Status",
      cell: (f) => <StatusBadge status={getFreightStatusLabel(f.status)} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (f) => (
        <Button
          size="sm"
          variant="outline"
          disabled={f.status === "delivered" || f.status === "cancelled"}
          onClick={(event) => {
            event.stopPropagation();
            handleAdvanceFreight(f);
          }}
        >
          <ArrowRight />
          Avançar
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fretes"
        description="Controle de cotações, contratações e rastreamento de frete."
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

      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Painel de fretes</CardTitle>
          <Button size="sm" variant="soft" onClick={handleGenerateFreights}>
            <Plus />
            Gerar fretes dos pedidos
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={visibleFreights}
            onRowClick={(freight) => setSelectedFreightId(freight.id)}
            emptyTitle="Sem fretes"
            emptyDescription="Nenhum frete contratado no momento."
          />
          <FreightDetailsForm
            freight={selectedFreight}
            form={form}
            documents={documents}
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            onChange={updateForm}
            onSave={handleSaveFreightDetails}
            onAdvance={handleAdvanceFreight}
            onUploadDocument={handleUploadFreightDocument}
            onOpenDocument={handleOpenFreightDocument}
          />
        </CardContent>
      </Card>

      <DriverAccessCard
        freight={selectedFreight}
        access={driverAccess}
        generatedAccess={generatedDriverAccess}
        loading={driverAccessLoading}
        onGenerate={handleGenerateDriverAccess}
        onRevoke={handleRevokeDriverAccess}
        onOpenProof={handleOpenDriverProof}
      />
    </div>
  );
}

function DriverAccessCard({
  freight,
  access,
  generatedAccess,
  loading,
  onGenerate,
  onRevoke,
  onOpenProof,
}: {
  freight?: FreightRecord;
  access: DriverAccessSummary | null;
  generatedAccess: GeneratedDriverAccess | null;
  loading: boolean;
  onGenerate: () => void;
  onRevoke: () => void;
  onOpenProof: (filePath: string) => void;
}) {
  const [copying, setCopying] = useState<string | null>(null);

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
        <CardTitle>Acesso temporário do motorista</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3 rounded-2xl border p-4">
          {!freight ? (
            <p className="text-sm text-muted-foreground">
              Clique em um frete do painel para gerar o link temporário do motorista.
            </p>
          ) : (
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
                    <p className="text-xs font-semibold text-muted-foreground">Link do motorista</p>
                    <p className="break-all text-sm">{generatedAccess.url}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">PIN temporário</p>
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
                  <p className="text-xs text-muted-foreground">
                    O PIN aparece somente agora. Se perder, gere um novo acesso.
                  </p>
                </div>
              ) : (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                  Nenhum PIN visível. Gere um novo acesso para copiar link e senha.
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="soft" onClick={onGenerate}>
                  <RotateCw />
                  Gerar novo acesso
                </Button>
                <Button
                  variant="outline"
                  disabled={!access || access.status !== "active"}
                  onClick={onRevoke}
                >
                  <XCircle />
                  Revogar acesso
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
          {!freight ? (
            <p className="text-sm text-muted-foreground">Selecione um frete para ver os eventos.</p>
          ) : access?.events.length ? (
            access.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-3 w-3 rounded-full bg-primary" />
                <div>
                  <p className="font-medium">{event.eventLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.occurredAt)} • Motorista via link temporário
                    {event.latitude ? " • localização registrada" : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            DRIVER_EVENT_FLOW.map((step) => (
              <div key={step.type} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-3 w-3 rounded-full bg-muted" />
                <div>
                  <p className="font-medium">{step.label}</p>
                  <p className="text-xs text-muted-foreground">Pendente</p>
                </div>
              </div>
            ))
          )}

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

function FreightDetailsForm({
  freight,
  form,
  documents,
  documentsLoading,
  documentsError,
  onChange,
  onSave,
  onAdvance,
  onUploadDocument,
  onOpenDocument,
}: {
  freight?: FreightRecord;
  form: FreightFormState;
  documents: FreightDocumentRecord[];
  documentsLoading: boolean;
  documentsError: string | null;
  onChange: (key: keyof FreightFormState, value: string) => void;
  onSave: () => void;
  onAdvance: (freight: FreightRecord) => void;
  onUploadDocument: (payload: {
    type: FreightDocumentType;
    file: File;
    notes: string;
  }) => Promise<void>;
  onOpenDocument: (document: FreightDocumentRecord) => void;
}) {
  const [documentType, setDocumentType] = useState<FreightDocumentType>("contract");
  const [documentNotes, setDocumentNotes] = useState("");
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);

  if (!freight) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
        Clique em um frete do painel para cadastrar transportadora, veículo, motorista, valor e
        datas operacionais.
      </div>
    );
  }

  const canAdvance = freight.status !== "delivered" && freight.status !== "cancelled";

  const handleSelectDocumentFile = (file?: File) => {
    if (!file) {
      setSelectedDocumentFile(null);
      return;
    }

    const validationMessage = validateFreightDocumentFile(file);
    if (validationMessage) {
      toast.error(validationMessage);
      setSelectedDocumentFile(null);
      return;
    }

    setSelectedDocumentFile(file);
  };

  const handleUploadDocument = async () => {
    if (!selectedDocumentFile) {
      toast.info("Selecione um arquivo antes de anexar.");
      return;
    }

    setDocumentUploading(true);
    try {
      await onUploadDocument({
        type: documentType,
        file: selectedDocumentFile,
        notes: documentNotes,
      });
      setSelectedDocumentFile(null);
      setDocumentNotes("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível anexar o documento.";
      toast.error(message);
    } finally {
      setDocumentUploading(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border bg-muted/20 p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Pencil className="h-4 w-4 text-primary" />
            Cadastro do frete {freight.code}
          </p>
          <p className="text-xs text-muted-foreground">
            Pedido {freight.orderNumber ?? "-"} • {freight.client}
          </p>
        </div>
        <StatusBadge status={getFreightStatusLabel(freight.status)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Transportadora">
          <Input
            value={form.carrierName}
            onChange={(event) => onChange("carrierName", event.target.value)}
            placeholder="Nome da transportadora"
          />
        </Field>
        <Field label="Motorista">
          <Input
            value={form.driverName}
            onChange={(event) => onChange("driverName", event.target.value)}
            placeholder="Nome do motorista"
          />
        </Field>
        <Field label="Veículo">
          <Input
            value={form.vehicleDescription}
            onChange={(event) => onChange("vehicleDescription", event.target.value)}
            placeholder="Truck, carreta, baú..."
          />
        </Field>
        <Field label="Placa">
          <Input
            value={form.vehiclePlate}
            onChange={(event) => onChange("vehiclePlate", event.target.value)}
            placeholder="ABC-1D23"
          />
        </Field>
        <Field label="Valor do frete">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.freightValue}
            onChange={(event) => onChange("freightValue", event.target.value)}
            placeholder="0,00"
          />
        </Field>
        <Field label="Carregamento">
          <Input
            type="datetime-local"
            value={form.pickupDate}
            onChange={(event) => onChange("pickupDate", event.target.value)}
          />
        </Field>
        <Field label="Previsão de entrega">
          <Input
            type="datetime-local"
            value={form.expectedDeliveryDate}
            onChange={(event) => onChange("expectedDeliveryDate", event.target.value)}
          />
        </Field>
        <Field label="Trajeto">
          <Input
            value={form.route}
            onChange={(event) => onChange("route", event.target.value)}
            placeholder="Origem -> destino"
          />
        </Field>
      </div>

      <Field label="Observações" className="mt-3">
        <Textarea
          value={form.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          placeholder="Dados de contratação, contato, restrições ou instruções para coleta."
        />
      </Field>

      <div className="mt-4 space-y-3 rounded-xl border bg-background/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              Documentos do frete
            </p>
            <p className="text-xs text-muted-foreground">
              Anexe contrato, proposta, nota ou outro documento ligado a este frete.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {documents.length} arquivo{documents.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {documentsError ? (
          <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
            {documentsError}
          </p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-[180px_1fr] xl:grid-cols-[180px_1fr_1.2fr_auto]">
          <Field label="Tipo">
            <Select
              value={documentType}
              onValueChange={(value) => setDocumentType(value as FreightDocumentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FREIGHT_DOCUMENT_TYPE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Arquivo">
            <div className="space-y-1">
              <Input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(event) => handleSelectDocumentFile(event.target.files?.[0])}
              />
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3.5 w-3.5" />
                PDF, JPG ou PNG até 10 MB.
              </p>
            </div>
          </Field>
          <Field label="Observação">
            <Input
              value={documentNotes}
              onChange={(event) => setDocumentNotes(event.target.value)}
              placeholder="Ex.: proposta aprovada pela transportadora"
            />
          </Field>
          <div className="flex items-end">
            <Button disabled={documentUploading} onClick={handleUploadDocument}>
              <Upload />
              {documentUploading ? "Anexando..." : "Anexar"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {documentsLoading ? (
            <p className="text-sm text-muted-foreground">Carregando documentos...</p>
          ) : null}
          {!documentsLoading && documents.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Nenhum documento anexado neste frete.
            </p>
          ) : null}
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex flex-col gap-3 rounded-lg border p-3 text-sm md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full">
                    {FREIGHT_DOCUMENT_TYPE_LABEL[document.type]}
                  </Badge>
                  <span className="truncate font-medium">{document.fileName}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(document.createdAt)}
                  {document.fileSize ? ` • ${formatBytes(document.fileSize)}` : ""}
                  {document.notes ? ` • ${document.notes}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!document.filePath}
                onClick={() => onOpenDocument(document)}
              >
                <ExternalLink />
                Abrir
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onSave}>
          <Save />
          Salvar dados do frete
        </Button>
        <Button disabled={!canAdvance} onClick={() => onAdvance(freight)}>
          <ArrowRight />
          Avançar status
        </Button>
      </div>
    </div>
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
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function createFreightFormState(freight?: FreightRecord): FreightFormState {
  return {
    carrierName: freight?.carrierName ?? "",
    driverName: freight?.driverName ?? "",
    vehicleDescription: freight?.vehicleDescription ?? "",
    vehiclePlate: freight?.vehiclePlate ?? "",
    route: freight?.route ?? "",
    freightValue: freight ? String(freight.freightValue || "") : "",
    pickupDate: toDateTimeInput(freight?.pickupDate),
    expectedDeliveryDate: toDateTimeInput(freight?.expectedDeliveryDate),
    notes: freight?.notes ?? "",
  };
}

function toDateTimeInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function parseDecimalInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
