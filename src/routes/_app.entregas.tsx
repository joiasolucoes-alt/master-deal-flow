import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  History,
  Upload,
  ExternalLink,
  MapPin,
  Plus,
  Save,
  Truck,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/features/app/app-context";
import type { DeliveryOccurrence, DeliveryRecord } from "@/data/types";
import {
  createDeliveryFromFreight,
  getDeliveryProgress,
  getDeliveryStatusLabel,
  getNextDeliveryStatus,
  updateOrderFromDelivery,
} from "@/features/deliveries/deliveryHelpers";
import {
  getDeliveryProofSignedUrl,
  uploadDeliveryProofFile,
  validateDeliveryProofFile,
} from "@/features/deliveries/deliveryProofStorage";
import { formatDateTime } from "@/lib/format";
import { belongsToUser, canViewAllFlows, filterOrdersForUser } from "@/lib/visibility";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/entregas")({
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const { auth, orders, freights, deliveries, upsertDelivery, upsertOrder } = useAppContext();
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleOrderIds = useMemo(
    () => new Set(visibleOrders.map((order) => order.id)),
    [visibleOrders],
  );
  const visibleDeliveries = useMemo(
    () =>
      deliveries.filter((delivery) => {
        if (canViewAllFlows(auth.user)) return true;
        return (
          visibleOrderIds.has(delivery.orderId ?? "") || belongsToUser(delivery.owner, auth.user)
        );
      }),
    [auth.user, deliveries, visibleOrderIds],
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
  const eligibleFreights = visibleFreights.filter(
    (freight) =>
      freight.status !== "quoted" &&
      freight.status !== "cancelled" &&
      !deliveries.some((delivery) => delivery.freightId === freight.id),
  );
  const inTransit = visibleDeliveries.filter((delivery) => delivery.status === "in_route");
  const delivered = visibleDeliveries.filter((delivery) => delivery.status === "delivered");
  const issues = visibleDeliveries.filter(
    (delivery) => delivery.status === "issue" || getOccurrences(delivery).length > 0,
  );
  const proofPending = delivered.filter((delivery) => !delivery.proofRegisteredAt);
  const actionableDeliveries = visibleDeliveries;

  const handleGenerateDeliveries = () => {
    if (eligibleFreights.length === 0) {
      toast.info("Não há fretes liberados sem entrega.");
      return;
    }

    eligibleFreights.forEach((freight) => upsertDelivery(createDeliveryFromFreight(freight)));
    toast.success("Entregas geradas a partir dos fretes liberados.");
  };

  const handleAdvanceDelivery = (delivery: DeliveryRecord) => {
    const nextStatus = getNextDeliveryStatus(delivery.status);
    if (nextStatus === delivery.status) return;

    const nextDelivery: DeliveryRecord = {
      ...delivery,
      status: nextStatus,
      currentLocation: getNextLocation(nextStatus),
      deliveredAt: nextStatus === "delivered" ? new Date().toISOString() : delivery.deliveredAt,
      proofNotes:
        nextStatus === "delivered" && !delivery.proofNotes
          ? "Entrega concluída pelo fluxo operacional."
          : delivery.proofNotes,
    };
    upsertDelivery(nextDelivery);

    const order = orders.find((item) => item.id === delivery.orderId);
    if (order) upsertOrder(updateOrderFromDelivery(order, nextDelivery));

    toast.success(`Entrega atualizada para ${getDeliveryStatusLabel(nextStatus)}.`);
  };

  const handleRegisterIssue = (delivery: DeliveryRecord) => {
    const occurrence = createOccurrence({
      type: "Ocorrência operacional",
      description: delivery.occurrenceNotes || "Ocorrência registrada para análise operacional.",
      location: delivery.currentLocation || "Em análise operacional",
      userName: auth.user?.name,
    });
    const issueDelivery: DeliveryRecord = {
      ...delivery,
      status: "issue",
      occurrences: [...getOccurrences(delivery), occurrence],
      occurrenceNotes: occurrence.description,
      currentLocation: delivery.currentLocation || "Em análise operacional",
    };
    upsertDelivery(issueDelivery);

    const order = orders.find((item) => item.id === delivery.orderId);
    if (order) upsertOrder(updateOrderFromDelivery(order, issueDelivery));

    toast.warning("Ocorrência registrada na entrega.");
  };

  const handleSaveOccurrence = (
    delivery: DeliveryRecord,
    occurrenceInput: Pick<DeliveryOccurrence, "type" | "description" | "location">,
  ) => {
    const occurrence = createOccurrence({
      ...occurrenceInput,
      userName: auth.user?.name,
    });
    const nextDelivery: DeliveryRecord = {
      ...delivery,
      status: "issue",
      currentLocation: occurrence.location || delivery.currentLocation || "Em análise operacional",
      occurrenceNotes: occurrence.description,
      occurrences: [...getOccurrences(delivery), occurrence],
    };
    upsertDelivery(nextDelivery);

    const order = orders.find((item) => item.id === delivery.orderId);
    if (order) upsertOrder(updateOrderFromDelivery(order, nextDelivery));

    toast.warning("Ocorrência adicionada ao histórico da entrega.");
  };

  const handleSaveProof = (
    delivery: DeliveryRecord,
    proof: Pick<
      DeliveryRecord,
      "proofDocumentNumber" | "proofFileName" | "proofReceivedBy" | "proofNotes"
    >,
    file?: File,
  ) => {
    return saveProofWithOptionalUpload(delivery, proof, file);
  };

  const saveProofWithOptionalUpload = async (
    delivery: DeliveryRecord,
    proof: Pick<
      DeliveryRecord,
      "proofDocumentNumber" | "proofFileName" | "proofReceivedBy" | "proofNotes"
    >,
    file?: File,
  ) => {
    const upload = file ? await uploadDeliveryProofFile({ deliveryId: delivery.id, file }) : null;
    const nextDelivery: DeliveryRecord = {
      ...delivery,
      ...proof,
      ...(upload ?? {}),
      proofFileName: upload?.proofFileName ?? proof.proofFileName,
      status: "delivered",
      currentLocation: "Entrega concluída",
      deliveredAt: delivery.deliveredAt ?? new Date().toISOString(),
      proofRegisteredAt: delivery.proofRegisteredAt ?? new Date().toISOString(),
    };
    upsertDelivery(nextDelivery);

    const order = orders.find((item) => item.id === delivery.orderId);
    if (order) upsertOrder(updateOrderFromDelivery(order, nextDelivery));

    toast.success("Canhoto/comprovante registrado na entrega.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entregas"
        description="Monitore as entregas em andamento, atrasos e comprovações."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Em trânsito" value={String(inTransit.length)} icon={Truck} tone="info" />
        <StatCard
          label="Entregues"
          value={String(delivered.length)}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Ocorrências"
          value={String(issues.length)}
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Canhotos pendentes"
          value={String(proofPending.length)}
          icon={FileCheck2}
          tone={proofPending.length > 0 ? "warning" : "success"}
        />
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Controle de entregas</CardTitle>
          <Button size="sm" variant="soft" onClick={handleGenerateDeliveries}>
            <Plus />
            Gerar entregas dos fretes
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {actionableDeliveries.map((delivery) => (
              <DeliveryCard
                key={delivery.id}
                delivery={delivery}
                onAdvance={handleAdvanceDelivery}
                onIssue={handleRegisterIssue}
                onSaveOccurrence={handleSaveOccurrence}
                onSaveProof={handleSaveProof}
              />
            ))}
            {actionableDeliveries.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Nenhuma entrega pendente no momento.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DeliveryCard({
  delivery,
  onAdvance,
  onIssue,
  onSaveOccurrence,
  onSaveProof,
}: {
  delivery: DeliveryRecord;
  onAdvance: (delivery: DeliveryRecord) => void;
  onIssue: (delivery: DeliveryRecord) => void;
  onSaveOccurrence: (
    delivery: DeliveryRecord,
    occurrence: Pick<DeliveryOccurrence, "type" | "description" | "location">,
  ) => void;
  onSaveProof: (
    delivery: DeliveryRecord,
    proof: Pick<
      DeliveryRecord,
      "proofDocumentNumber" | "proofFileName" | "proofReceivedBy" | "proofNotes"
    >,
    file?: File,
  ) => Promise<void>;
}) {
  const progress = getDeliveryProgress(delivery.status);
  const [proofOpen, setProofOpen] = useState(Boolean(delivery.proofRegisteredAt));
  const [proofDocumentNumber, setProofDocumentNumber] = useState(
    delivery.proofDocumentNumber ?? "",
  );
  const [proofFileName, setProofFileName] = useState(delivery.proofFileName ?? "");
  const [proofReceivedBy, setProofReceivedBy] = useState(delivery.proofReceivedBy ?? "");
  const [proofNotes, setProofNotes] = useState(delivery.proofNotes ?? "");
  const [selectedProofFile, setSelectedProofFile] = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [occurrenceOpen, setOccurrenceOpen] = useState(false);
  const [occurrenceType, setOccurrenceType] = useState("Ocorrência operacional");
  const [occurrenceLocation, setOccurrenceLocation] = useState(delivery.currentLocation ?? "");
  const [occurrenceDescription, setOccurrenceDescription] = useState("");
  const proofReady = delivery.status === "delivered";

  const handleSubmitProof = async () => {
    if (!proofReceivedBy.trim() && !proofDocumentNumber.trim() && !proofFileName.trim()) {
      toast.info("Informe ao menos recebedor, número do canhoto ou referência do arquivo.");
      return;
    }

    setProofUploading(true);
    try {
      await onSaveProof(
        delivery,
        {
          proofDocumentNumber: proofDocumentNumber.trim(),
          proofFileName: proofFileName.trim(),
          proofReceivedBy: proofReceivedBy.trim(),
          proofNotes: proofNotes.trim(),
        },
        selectedProofFile ?? undefined,
      );
      setSelectedProofFile(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível anexar o comprovante.";
      toast.error(message);
    } finally {
      setProofUploading(false);
    }
  };

  const handleSelectProofFile = (file?: File) => {
    if (!file) {
      setSelectedProofFile(null);
      return;
    }

    const validationMessage = validateDeliveryProofFile(file);
    if (validationMessage) {
      toast.error(validationMessage);
      setSelectedProofFile(null);
      return;
    }

    setSelectedProofFile(file);
    setProofFileName(file.name);
  };

  const handleOpenProofFile = async () => {
    if (!delivery.proofFilePath) return;
    try {
      const url = await getDeliveryProofSignedUrl(delivery.proofFilePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível abrir o comprovante.";
      toast.error(message);
    }
  };

  const handleSubmitOccurrence = () => {
    const description = occurrenceDescription.trim();
    if (!description) {
      toast.info("Informe a descrição da ocorrência antes de salvar.");
      return;
    }

    onSaveOccurrence(delivery, {
      type: occurrenceType.trim() || "Ocorrência operacional",
      location: occurrenceLocation.trim(),
      description,
    });
    setOccurrenceDescription("");
    setOccurrenceOpen(false);
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">{delivery.orderNumber ?? delivery.freightCode}</CardTitle>
          <p className="text-sm text-muted-foreground">{delivery.client}</p>
        </div>
        <StatusBadge status={getDeliveryStatusLabel(delivery.status)} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-[auto_1fr] items-center gap-3 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium">{delivery.route}</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Entrega</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Previsão</p>
            <p className="font-medium">{formatDateTime(delivery.expectedDeliveryDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Localização</p>
            <p className="font-medium">{delivery.currentLocation}</p>
          </div>
        </div>
        {delivery.occurrenceNotes ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
            {delivery.occurrenceNotes}
          </p>
        ) : null}
        {getOccurrences(delivery).length > 0 ? (
          <div className="space-y-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
            <div className="flex items-center gap-2 font-semibold">
              <History className="h-4 w-4" />
              Histórico de ocorrências
            </div>
            <div className="space-y-2">
              {getOccurrences(delivery)
                .slice()
                .reverse()
                .map((occurrence) => (
                  <div key={occurrence.id} className="rounded-md bg-background/70 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{occurrence.type}</span>
                      <span>{formatDateTime(occurrence.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-foreground">{occurrence.description}</p>
                    <p className="mt-1 text-muted-foreground">
                      {occurrence.location ? `${occurrence.location} • ` : ""}
                      {occurrence.createdBy}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
        {delivery.proofRegisteredAt ? (
          <div className="rounded-lg border border-success/30 bg-success-soft p-3 text-xs text-success">
            <p className="font-semibold">Canhoto registrado</p>
            <p>
              {delivery.proofReceivedBy
                ? `Recebido por ${delivery.proofReceivedBy}`
                : "Recebedor não informado"}
              {delivery.proofDocumentNumber ? ` • Doc. ${delivery.proofDocumentNumber}` : ""}
            </p>
            {delivery.proofFileName ? (
              <p>
                Referência: {delivery.proofFileName}
                {delivery.proofFileSize ? ` • ${formatBytes(delivery.proofFileSize)}` : ""}
              </p>
            ) : null}
            {delivery.proofFilePath ? (
              <Button
                className="mt-2 h-8"
                variant="outline"
                size="sm"
                onClick={handleOpenProofFile}
              >
                <ExternalLink />
                Abrir arquivo
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            variant="outline"
            size="sm"
            disabled={delivery.status === "delivered" || delivery.status === "cancelled"}
            onClick={() => onAdvance(delivery)}
          >
            <ArrowRight />
            Avançar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={delivery.status === "delivered" || delivery.status === "cancelled"}
            onClick={() => setOccurrenceOpen((current) => !current)}
          >
            <AlertTriangle />
            Ocorrência
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/pedidos/$id" params={{ id: delivery.orderId ?? "" }}>
              Ver pedido
            </Link>
          </Button>
        </div>
        {occurrenceOpen ? (
          <div className="space-y-3 rounded-lg border border-warning/30 bg-background/50 p-3">
            <div>
              <p className="text-sm font-semibold">Nova ocorrência</p>
              <p className="text-xs text-muted-foreground">
                Registre o que aconteceu para manter o histórico da entrega.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ProofField label="Tipo">
                <Input
                  value={occurrenceType}
                  onChange={(event) => setOccurrenceType(event.target.value)}
                  placeholder="Ex.: Cliente ausente, avaria, atraso"
                />
              </ProofField>
              <ProofField label="Local">
                <Input
                  value={occurrenceLocation}
                  onChange={(event) => setOccurrenceLocation(event.target.value)}
                  placeholder="Local da ocorrência"
                />
              </ProofField>
              <div className="md:col-span-2">
                <ProofField label="Descrição">
                  <Textarea
                    value={occurrenceDescription}
                    onChange={(event) => setOccurrenceDescription(event.target.value)}
                    placeholder="Descreva o ocorrido e a ação necessária."
                    rows={3}
                  />
                </ProofField>
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button size="sm" onClick={handleSubmitOccurrence}>
                  <Save />
                  Salvar ocorrência
                </Button>
                <Button variant="outline" size="sm" onClick={() => onIssue(delivery)}>
                  Registro rápido
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="space-y-3 rounded-lg border border-border bg-background/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Canhoto/comprovante</p>
              <p className="text-xs text-muted-foreground">
                Registre a confirmação de entrega recebida do cliente.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!proofReady}
              onClick={() => setProofOpen((current) => !current)}
            >
              <FileCheck2 />
              {proofOpen ? "Fechar" : "Registrar"}
            </Button>
          </div>
          {!proofReady ? (
            <p className="text-xs text-muted-foreground">
              O canhoto fica disponível depois que a entrega estiver concluída.
            </p>
          ) : null}
          {proofOpen && proofReady ? (
            <div className="grid gap-3 md:grid-cols-2">
              <ProofField label="Recebido por">
                <Input
                  value={proofReceivedBy}
                  onChange={(event) => setProofReceivedBy(event.target.value)}
                  placeholder="Nome de quem recebeu"
                />
              </ProofField>
              <ProofField label="Nº canhoto/NF">
                <Input
                  value={proofDocumentNumber}
                  onChange={(event) => setProofDocumentNumber(event.target.value)}
                  placeholder="Ex.: NF 587102"
                />
              </ProofField>
              <ProofField label="Referência do arquivo">
                <Input
                  value={proofFileName}
                  onChange={(event) => setProofFileName(event.target.value)}
                  placeholder="Ex.: canhoto-ped-3866.pdf"
                />
              </ProofField>
              <ProofField label="Arquivo">
                <div className="space-y-2">
                  <Input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) => handleSelectProofFile(event.target.files?.[0])}
                  />
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Upload className="h-3.5 w-3.5" />
                    PDF, JPG ou PNG até 8 MB.
                  </p>
                </div>
              </ProofField>
              <div className="md:col-span-2">
                <ProofField label="Observações">
                  <Textarea
                    value={proofNotes}
                    onChange={(event) => setProofNotes(event.target.value)}
                    placeholder="Condição da entrega, ressalva ou conferência."
                    rows={3}
                  />
                </ProofField>
              </div>
              <div className="md:col-span-2">
                <Button size="sm" disabled={proofUploading} onClick={handleSubmitProof}>
                  <Save />
                  {proofUploading ? "Salvando..." : "Salvar canhoto"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ProofField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function createOccurrence({
  type,
  description,
  location,
  userName,
}: {
  type: string;
  description: string;
  location?: string;
  userName?: string;
}): DeliveryOccurrence {
  return {
    id: crypto.randomUUID(),
    type: type.trim() || "Ocorrência operacional",
    description: description.trim(),
    location: location?.trim() || undefined,
    createdAt: new Date().toISOString(),
    createdBy: userName || "Sistema",
  };
}

function getOccurrences(delivery: DeliveryRecord) {
  return delivery.occurrences ?? [];
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getNextLocation(status: DeliveryRecord["status"]) {
  if (status === "loading") return "Unidade de carregamento";
  if (status === "loaded") return "Carga carregada";
  if (status === "in_route") return "Em trânsito";
  if (status === "arrived") return "No destino";
  if (status === "delivered") return "Entrega concluída";
  return "Aguardando expedição";
}
