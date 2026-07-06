import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Download, FileText, Printer } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Timeline } from "@/components/app/timeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FinancialTitle, Order } from "@/data/types";
import { useAppContext } from "@/features/app/app-context";
import {
  calculateBillingProgress,
  getFinancialTitleStatus,
} from "@/features/finance/financialTitleHelpers";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { filterOrdersForUser } from "@/lib/visibility";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pedidos/$id")({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { id } = useParams({ from: "/_app/pedidos/$id" });
  const { auth, orders, financialTitles, upsertFinancialTitle, upsertOrder } = useAppContext();
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingForm, setBillingForm] = useState<BillingForm>(() => createEmptyBillingForm());
  const order = filterOrdersForUser(orders, auth.user).find((o) => o.id === id);
  if (!order) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/pedidos">
            <ArrowLeft /> Voltar
          </Link>
        </Button>
        <p className="text-muted-foreground">Pedido não encontrado.</p>
      </div>
    );
  }
  const orderReceivables = financialTitles.filter(
    (title) => title.orderId === order.id && title.type === "receivable",
  );
  const billedAmount = orderReceivables
    .filter((title) => title.status !== "cancelled")
    .reduce((sum, title) => sum + title.amount, 0);
  const receivedAmount = orderReceivables.reduce((sum, title) => sum + title.paidAmount, 0);
  const canBillOrder =
    order.status === "Aguardando faturamento" || order.status === "Em faturamento";

  const handleOpenBilling = () => {
    if (!canBillOrder || order.billingProgress >= 100) {
      toast.info("Este pedido já saiu da etapa de faturamento.");
      return;
    }

    setBillingForm(createBillingForm(order, financialTitles));
    setBillingOpen(true);
  };

  const handleRegisterBilling = () => {
    const invoiceNumber = billingForm.invoiceNumber.trim();
    const invoiceAmount = parseCurrencyInput(billingForm.invoiceAmount);
    if (!invoiceNumber) {
      toast.error("Informe o número da NF.");
      return;
    }
    if (invoiceAmount <= 0) {
      toast.error("Informe um valor faturado maior que zero.");
      return;
    }
    if (!billingForm.invoiceIssuedAt || !billingForm.billingDueDate) {
      toast.error("Informe a emissão e o vencimento da NF.");
      return;
    }

    const now = new Date().toISOString();
    const title: FinancialTitle = {
      id: `fin-${order.id}-${slugify(invoiceNumber)}`,
      orderId: order.id,
      orderNumber: order.number,
      client: order.client,
      titleNumber: invoiceNumber,
      type: "receivable",
      status: "open",
      dueDate: dateInputToIso(billingForm.billingDueDate),
      amount: invoiceAmount,
      paidAmount: 0,
      paymentMethod: order.paymentTerms,
      bankName: "",
      invoiceNumber,
      invoiceIssuedAt: dateInputToIso(billingForm.invoiceIssuedAt),
      notes: billingForm.billingNotes || `Faturamento registrado para o pedido ${order.number}.`,
      owner: order.owner,
      unit: order.unit,
      createdAt: now,
    };
    title.status = getFinancialTitleStatus(title);

    const nextTitles = upsertTitleInMemory(financialTitles, title).filter(
      (item) => item.orderId === order.id && item.type === "receivable",
    );
    const updatedOrder = updateOrderBilling(
      {
        ...order,
        invoiceNumber,
        invoiceAmount: getBilledAmount(nextTitles),
        invoiceIssuedAt: title.invoiceIssuedAt,
        billingDueDate: title.dueDate,
        billingNotes: billingForm.billingNotes,
        billedAt: now,
        billedBy: auth.user?.name ?? auth.user?.email ?? "Financeiro",
        documents: addUnique(
          order.documents,
          `${invoiceNumber} - ${formatCurrency(invoiceAmount)}`,
        ),
        notes: addUnique(
          order.notes,
          `Faturamento ${invoiceNumber} registrado em ${formatDate(now)}.`,
        ),
        timeline: addTimelineEvent(order, {
          title: "Nota fiscal registrada",
          description: `${invoiceNumber} registrada no valor de ${formatCurrency(invoiceAmount)}.`,
          date: now,
        }),
      },
      nextTitles,
    );

    upsertFinancialTitle(title);
    upsertOrder(updatedOrder);
    setBillingOpen(false);
    setBillingForm(createEmptyBillingForm());
    toast.success(
      updatedOrder.status === "Em separação"
        ? "Faturamento concluído. Pedido liberado para separação."
        : "Faturamento parcial registrado.",
    );
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/pedidos">
          <ArrowLeft /> Voltar para pedidos
        </Link>
      </Button>

      <PageHeader
        title={order.number}
        description={`${order.client} • ${order.origin} → ${order.destination}`}
        action={
          <>
            <Button variant="outline">
              <Printer /> Imprimir
            </Button>
            <Button variant="outline">
              <Download /> Exportar PDF
            </Button>
            <Button onClick={handleOpenBilling}>
              <FileText /> Gerar nota fiscal
            </Button>
          </>
        }
      />

      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gerar nota fiscal</DialogTitle>
            <DialogDescription>
              Registre os dados da NF para liberar o pedido para a próxima etapa.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              <span>NF</span>
              <Input
                value={billingForm.invoiceNumber}
                onChange={(event) =>
                  setBillingForm((current) => ({
                    ...current,
                    invoiceNumber: event.target.value,
                  }))
                }
                placeholder="Ex: NF 587102"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Valor faturado</span>
              <Input
                value={billingForm.invoiceAmount}
                onChange={(event) =>
                  setBillingForm((current) => ({
                    ...current,
                    invoiceAmount: event.target.value,
                  }))
                }
                placeholder="0,00"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Emissão</span>
              <Input
                type="date"
                value={billingForm.invoiceIssuedAt}
                onChange={(event) =>
                  setBillingForm((current) => ({
                    ...current,
                    invoiceIssuedAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Vencimento</span>
              <Input
                type="date"
                value={billingForm.billingDueDate}
                onChange={(event) =>
                  setBillingForm((current) => ({
                    ...current,
                    billingDueDate: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="block space-y-1 text-sm font-medium">
            <span>Observação do faturamento</span>
            <Textarea
              value={billingForm.billingNotes}
              onChange={(event) =>
                setBillingForm((current) => ({
                  ...current,
                  billingNotes: event.target.value,
                }))
              }
              placeholder="Notas internas, condição especial ou orientação para o pedido."
            />
          </label>

          <div className="text-sm text-muted-foreground">
            Restante a faturar:{" "}
            <strong className="text-foreground">
              {formatCurrency(getRemainingBillingAmount(order, financialTitles))}
            </strong>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBillingOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRegisterBilling}>
              <FileText />
              Registrar faturamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={order.status} />
        <Badge variant="outline" className="rounded-full">
          Prioridade: {order.priority}
        </Badge>
        <Badge variant="outline" className="rounded-full">
          Pagamento: {order.paymentTerms}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Resumo do pedido</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Info label="Responsável" value={order.owner} />
              <Info label="Unidade" value={order.unit} />
              <Info label="Valor total" value={formatCurrency(order.totalValue)} highlight />
              <Info label="Data do pedido" value={formatDateTime(order.date)} />
              <Info label="Previsão de entrega" value={formatDateTime(order.expectedDelivery)} />
              <Info label="Status logístico" value={order.logisticsStatus} />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Produtos</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Caixas</TableHead>
                    <TableHead className="text-right">Un/Cx</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Valor un.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.product}</TableCell>
                      <TableCell className="text-right">{p.boxes}</TableCell>
                      <TableCell className="text-right">{p.unitsPerBox}</TableCell>
                      <TableCell className="text-right">{p.quantityTotal}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.saleUnit)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(p.saleUnit * p.quantityTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Faturamento</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Info label="NF principal" value={order.invoiceNumber ?? "Não faturado"} />
              <Info label="Valor faturado" value={formatCurrency(billedAmount)} highlight />
              <Info label="Valor recebido" value={formatCurrency(receivedAmount)} />
              <Info
                label="Emissão"
                value={order.invoiceIssuedAt ? formatDate(order.invoiceIssuedAt) : "-"}
              />
              <Info
                label="Vencimento"
                value={order.billingDueDate ? formatDate(order.billingDueDate) : "-"}
              />
              <Info label="Faturado por" value={order.billedBy ?? "-"} />
              <div className="md:col-span-3">
                <p className="text-xs text-muted-foreground">Observação</p>
                <p className="mt-1 font-medium text-foreground">
                  {order.billingNotes || "Sem observação registrada."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Documentos e anotações</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Documentos</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {order.documents.map((doc) => (
                    <li key={doc} className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      {doc}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Anotações</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {order.notes.map((note, i) => (
                    <li key={i}>• {note}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Progresso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Bar label="Faturamento" value={order.billingProgress} />
              <Bar label="Entrega" value={order.deliveryProgress} />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Linha do tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline items={order.timeline} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 ${highlight ? "text-lg font-semibold text-foreground" : "font-medium text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}

type BillingForm = {
  invoiceNumber: string;
  invoiceAmount: string;
  invoiceIssuedAt: string;
  billingDueDate: string;
  billingNotes: string;
};

function createBillingForm(order: Order, titles: FinancialTitle[]): BillingForm {
  const remainingAmount = getRemainingBillingAmount(order, titles);
  return {
    invoiceNumber: order.invoiceNumber ?? `NF ${order.number.replace(/\D/g, "").slice(-6)}`,
    invoiceAmount: formatCurrencyInput(remainingAmount || order.totalValue),
    invoiceIssuedAt: toDateInput(order.invoiceIssuedAt ?? new Date().toISOString()),
    billingDueDate: toDateInput(order.billingDueDate ?? getDefaultDueDate(order)),
    billingNotes: order.billingNotes ?? "",
  };
}

function createEmptyBillingForm(): BillingForm {
  const today = toDateInput(new Date().toISOString());
  return {
    invoiceNumber: "",
    invoiceAmount: "",
    invoiceIssuedAt: today,
    billingDueDate: today,
    billingNotes: "",
  };
}

function updateOrderBilling(order: Order, titles: FinancialTitle[]): Order {
  const billingProgress = calculateBillingProgress(titles, order.totalValue);
  const status =
    billingProgress >= 100 &&
    (order.status === "Aguardando faturamento" || order.status === "Em faturamento")
      ? "Em separação"
      : billingProgress > 0 && order.status === "Aguardando faturamento"
        ? "Em faturamento"
        : order.status;

  return {
    ...order,
    billingProgress,
    status,
  };
}

function getRemainingBillingAmount(order: Order, titles: FinancialTitle[]) {
  const billedAmount = getBilledAmount(
    titles.filter((title) => title.orderId === order.id && title.type === "receivable"),
  );
  return Math.max(0, roundCurrency(order.totalValue - billedAmount));
}

function getBilledAmount(titles: FinancialTitle[]) {
  return roundCurrency(
    titles
      .filter((title) => title.type === "receivable" && title.status !== "cancelled")
      .reduce((sum, title) => sum + title.amount, 0),
  );
}

function upsertTitleInMemory(titles: FinancialTitle[], title: FinancialTitle) {
  const exists = titles.some((item) => item.id === title.id);
  if (exists) return titles.map((item) => (item.id === title.id ? title : item));
  return [title, ...titles];
}

function getDefaultDueDate(order: Order) {
  const days = order.paymentTerms.match(/\d+/)?.[0];
  const dueDays = days ? Number(days) : 28;
  const base = new Date();
  base.setDate(base.getDate() + (Number.isFinite(dueDays) ? dueDays : 28));
  return base.toISOString();
}

function addTimelineEvent(
  order: Order,
  event: { title: string; description: string; date: string },
) {
  const exists = order.timeline.some(
    (item) => item.title === event.title && item.description === event.description,
  );
  if (exists) return order.timeline;
  return [
    ...order.timeline,
    {
      id: `evt-${order.id}-billing-${Date.now()}`,
      title: event.title,
      description: event.description,
      date: event.date,
      completed: true,
    },
  ];
}

function dateInputToIso(value: string) {
  if (!value) return new Date().toISOString();
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatCurrencyInput(value: number) {
  return roundCurrency(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || crypto.randomUUID()
  );
}

function addUnique(values: string[], value: string) {
  if (values.includes(value)) return values;
  return [...values, value];
}

function parseCurrencyInput(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[R$]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
