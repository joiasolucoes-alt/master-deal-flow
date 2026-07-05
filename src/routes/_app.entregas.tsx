import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
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
import type { DeliveryRecord } from "@/data/types";
import {
  createDeliveryFromFreight,
  getDeliveryProgress,
  getDeliveryStatusLabel,
  getNextDeliveryStatus,
  updateOrderFromDelivery,
} from "@/features/deliveries/deliveryHelpers";
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
  const issues = visibleDeliveries.filter((delivery) => delivery.status === "issue");
  const proofPending = delivered.filter((delivery) => !delivery.proofRegisteredAt);
  const actionableDeliveries = visibleDeliveries.filter(
    (delivery) => delivery.status !== "delivered" || !delivery.proofRegisteredAt,
  );

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
    const issueDelivery: DeliveryRecord = {
      ...delivery,
      status: "issue",
      occurrenceNotes:
        delivery.occurrenceNotes || "Ocorrência registrada para análise operacional.",
      currentLocation: delivery.currentLocation || "Em análise operacional",
    };
    upsertDelivery(issueDelivery);

    const order = orders.find((item) => item.id === delivery.orderId);
    if (order) upsertOrder(updateOrderFromDelivery(order, issueDelivery));

    toast.warning("Ocorrência registrada na entrega.");
  };

  const handleSaveProof = (
    delivery: DeliveryRecord,
    proof: Pick<
      DeliveryRecord,
      "proofDocumentNumber" | "proofFileName" | "proofReceivedBy" | "proofNotes"
    >,
  ) => {
    const nextDelivery: DeliveryRecord = {
      ...delivery,
      ...proof,
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
  onSaveProof,
}: {
  delivery: DeliveryRecord;
  onAdvance: (delivery: DeliveryRecord) => void;
  onIssue: (delivery: DeliveryRecord) => void;
  onSaveProof: (
    delivery: DeliveryRecord,
    proof: Pick<
      DeliveryRecord,
      "proofDocumentNumber" | "proofFileName" | "proofReceivedBy" | "proofNotes"
    >,
  ) => void;
}) {
  const progress = getDeliveryProgress(delivery.status);
  const [proofOpen, setProofOpen] = useState(Boolean(delivery.proofRegisteredAt));
  const [proofDocumentNumber, setProofDocumentNumber] = useState(
    delivery.proofDocumentNumber ?? "",
  );
  const [proofFileName, setProofFileName] = useState(delivery.proofFileName ?? "");
  const [proofReceivedBy, setProofReceivedBy] = useState(delivery.proofReceivedBy ?? "");
  const [proofNotes, setProofNotes] = useState(delivery.proofNotes ?? "");
  const proofReady = delivery.status === "delivered";

  const handleSubmitProof = () => {
    if (!proofReceivedBy.trim() && !proofDocumentNumber.trim() && !proofFileName.trim()) {
      toast.info("Informe ao menos recebedor, número do canhoto ou referência do arquivo.");
      return;
    }

    onSaveProof(delivery, {
      proofDocumentNumber: proofDocumentNumber.trim(),
      proofFileName: proofFileName.trim(),
      proofReceivedBy: proofReceivedBy.trim(),
      proofNotes: proofNotes.trim(),
    });
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
        {delivery.proofRegisteredAt ? (
          <div className="rounded-lg border border-success/30 bg-success-soft p-3 text-xs text-success">
            <p className="font-semibold">Canhoto registrado</p>
            <p>
              {delivery.proofReceivedBy
                ? `Recebido por ${delivery.proofReceivedBy}`
                : "Recebedor não informado"}
              {delivery.proofDocumentNumber ? ` • Doc. ${delivery.proofDocumentNumber}` : ""}
            </p>
            {delivery.proofFileName ? <p>Referência: {delivery.proofFileName}</p> : null}
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
            onClick={() => onIssue(delivery)}
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
                <Button size="sm" onClick={handleSubmitProof}>
                  <Save />
                  Salvar canhoto
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

function getNextLocation(status: DeliveryRecord["status"]) {
  if (status === "loading") return "Unidade de carregamento";
  if (status === "loaded") return "Carga carregada";
  if (status === "in_route") return "Em trânsito";
  if (status === "arrived") return "No destino";
  if (status === "delivered") return "Entrega concluída";
  return "Aguardando expedição";
}
