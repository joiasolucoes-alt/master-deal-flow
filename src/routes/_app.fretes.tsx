import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Copy,
  Link2,
  MapPin,
  Pencil,
  Plus,
  RotateCw,
  Save,
  Truck,
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
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/features/app/app-context";
import type { FreightRecord } from "@/data/types";
import {
  createFreightFromOrder,
  getFreightStatusLabel,
  getNextFreightStatus,
  updateOrderFromFreight,
} from "@/features/freights/freightHelpers";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { belongsToUser, canViewAllFlows, filterOrdersForUser } from "@/lib/visibility";
import { toast } from "sonner";

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
  const { auth, orders, freights, upsertFreight, upsertOrder } = useAppContext();
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
    toast.success("Dados do frete salvos.");
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
            onChange={updateForm}
            onSave={handleSaveFreightDetails}
            onAdvance={handleAdvanceFreight}
          />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Detalhe do rastreamento do motorista</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3 rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Link público</span>
              <Badge variant="outline">Ativo</Badge>
            </div>
            <p className="break-all rounded-xl bg-muted p-3 text-sm">
              {window.location.origin}/motorista/demo
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigator.clipboard?.writeText(`${window.location.origin}/motorista/demo`)
                }
              >
                <Copy />
                Copiar
              </Button>
              <Button variant="outline" size="sm">
                <XCircle />
                Revogar
              </Button>
              <Button variant="outline" size="sm">
                <RotateCw />
                Novo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ao contratar um frete, o backend deve gravar token com hash e expiração em
              driver_tracking_links; o token puro aparece apenas nesta URL.
            </p>
          </div>
          <div className="space-y-3 rounded-2xl border p-4">
            <h3 className="font-semibold">Timeline operacional</h3>
            {[
              "Chegou para coleta",
              "Carregado",
              "Em trânsito",
              "Entregue",
              "Comprovante anexado",
            ].map((label, index) => (
              <div key={label} className="flex items-start gap-3 text-sm">
                <div
                  className={`mt-1 h-3 w-3 rounded-full ${index < 3 ? "bg-primary" : "bg-muted"}`}
                />
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {index < 3
                      ? formatDateTime(new Date(Date.now() - (3 - index) * 3600000).toISOString())
                      : "Pendente"}
                    {index === 2 ? " • localização registrada" : ""}
                  </p>
                </div>
              </div>
            ))}
            <Button variant="soft" size="sm">
              <Link2 />
              Abrir comprovante quando disponível
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FreightDetailsForm({
  freight,
  form,
  onChange,
  onSave,
  onAdvance,
}: {
  freight?: FreightRecord;
  form: FreightFormState;
  onChange: (key: keyof FreightFormState, value: string) => void;
  onSave: () => void;
  onAdvance: (freight: FreightRecord) => void;
}) {
  if (!freight) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
        Clique em um frete do painel para cadastrar transportadora, veículo, motorista, valor e
        datas operacionais.
      </div>
    );
  }

  const canAdvance = freight.status !== "delivered" && freight.status !== "cancelled";

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
