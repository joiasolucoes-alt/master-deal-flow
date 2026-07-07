import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Plus,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type DataColumn } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/features/app/app-context";
import type { FinancialTitle, Order } from "@/data/types";
import {
  calculateBillingProgress,
  createFinancialTitlesFromOrder,
  createPayableTitlesFromOrder,
  getFinancialTitleStatus,
  getStatusLabel,
} from "@/features/finance/financialTitleHelpers";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import { belongsToUser, canViewAllFlows, filterOrdersForUser } from "@/lib/visibility";
import { toast } from "sonner";
import { createWalletEntry, upsertWalletEntry } from "@/features/negotiation-wallets";

export const Route = createFileRoute("/_app/financeiro")({
  component: FinancialPage,
});

function FinancialPage() {
  const {
    auth,
    orders,
    financialTitles,
    freights,
    negotiationWallets,
    upsertFinancialTitle,
    upsertOrder,
    upsertNegotiationWallet,
  } = useAppContext();
  const [selectedBillingOrderId, setSelectedBillingOrderId] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState<BillingForm>(() => createEmptyBillingForm());
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleOrderIds = useMemo(
    () => new Set(visibleOrders.map((order) => order.id)),
    [visibleOrders],
  );
  const visibleTitles = useMemo(() => {
    return financialTitles
      .map((title) => ({ ...title, status: getFinancialTitleStatus(title) }))
      .filter((title) => {
        if (canViewAllFlows(auth.user)) return true;
        return visibleOrderIds.has(title.orderId ?? "") || belongsToUser(title.owner, auth.user);
      });
  }, [auth.user, financialTitles, visibleOrderIds]);
  const visibleReceivables = useMemo(
    () => visibleTitles.filter((title) => title.type === "receivable"),
    [visibleTitles],
  );
  const visiblePayables = useMemo(
    () => visibleTitles.filter((title) => title.type === "payable"),
    [visibleTitles],
  );
  const totalReceive = visibleReceivables
    .filter((r) => r.status !== "paid" && r.status !== "cancelled")
    .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0);
  const totalPayable = visiblePayables
    .filter((r) => r.status !== "paid" && r.status !== "cancelled")
    .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0);
  const overdue =
    visibleReceivables
      .filter((r) => r.status === "overdue")
      .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0) +
    visiblePayables
      .filter((r) => r.status === "overdue")
      .reduce((sum, r) => sum + Math.max(r.amount - r.paidAmount, 0), 0);
  const projectedBalance = totalReceive - totalPayable;
  const cashflow = useMemo(() => buildCashflow(visibleTitles), [visibleTitles]);
  const ordersWithoutReceivables = visibleOrders.filter(
    (order) =>
      !financialTitles.some((title) => title.orderId === order.id && title.type === "receivable"),
  );
  const billableOrders = useMemo(
    () =>
      visibleOrders.filter(
        (order) =>
          (order.status === "Aguardando faturamento" || order.status === "Em faturamento") &&
          order.billingProgress < 100,
      ),
    [visibleOrders],
  );
  const selectedBillingOrder = useMemo(
    () => billableOrders.find((order) => order.id === selectedBillingOrderId) ?? null,
    [billableOrders, selectedBillingOrderId],
  );
  const ordersWithoutPayables = visibleOrders.filter(
    (order) =>
      !financialTitles.some((title) => title.orderId === order.id && title.type === "payable"),
  );

  const handleGenerateReceivables = () => {
    if (ordersWithoutReceivables.length === 0) {
      toast.info("Todos os pedidos visíveis já possuem contas a receber.");
      return;
    }

    ordersWithoutReceivables.forEach((order) => {
      const titles = createFinancialTitlesFromOrder(order);
      titles.forEach(upsertFinancialTitle);
      upsertOrder(updateOrderBilling(order, titles));
    });
    toast.success("Contas a receber geradas a partir dos pedidos.");
  };

  const handleSelectBillingOrder = (order: Order) => {
    const remainingAmount = getRemainingBillingAmount(order, financialTitles);
    setSelectedBillingOrderId(order.id);
    setBillingForm({
      invoiceNumber: order.invoiceNumber ?? `NF ${order.number.replace(/\D/g, "").slice(-6)}`,
      invoiceAmount: formatCurrencyInput(remainingAmount || order.totalValue),
      invoiceIssuedAt: toDateInput(order.invoiceIssuedAt ?? new Date().toISOString()),
      billingDueDate: toDateInput(order.billingDueDate ?? getDefaultDueDate(order)),
      billingNotes: order.billingNotes ?? "",
    });
  };

  const handleRegisterBilling = () => {
    if (!selectedBillingOrder) {
      toast.error("Selecione um pedido para faturar.");
      return;
    }

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
      id: `fin-${selectedBillingOrder.id}-${slugify(invoiceNumber)}`,
      orderId: selectedBillingOrder.id,
      orderNumber: selectedBillingOrder.number,
      client: selectedBillingOrder.client,
      titleNumber: invoiceNumber,
      type: "receivable",
      status: "open",
      dueDate: dateInputToIso(billingForm.billingDueDate),
      amount: invoiceAmount,
      paidAmount: 0,
      paymentMethod: selectedBillingOrder.paymentTerms,
      bankName: "",
      invoiceNumber,
      invoiceIssuedAt: dateInputToIso(billingForm.invoiceIssuedAt),
      notes:
        billingForm.billingNotes ||
        `Faturamento registrado para o pedido ${selectedBillingOrder.number}.`,
      owner: selectedBillingOrder.owner,
      unit: selectedBillingOrder.unit,
      createdAt: now,
    };
    title.status = getFinancialTitleStatus(title);

    const nextTitles = upsertTitleInMemory(financialTitles, title).filter(
      (item) => item.orderId === selectedBillingOrder.id && item.type === "receivable",
    );
    const updatedOrder = updateOrderBilling(
      {
        ...selectedBillingOrder,
        invoiceNumber,
        invoiceAmount: getBilledAmount(nextTitles),
        invoiceIssuedAt: title.invoiceIssuedAt,
        billingDueDate: title.dueDate,
        billingNotes: billingForm.billingNotes,
        billedAt: now,
        billedBy: auth.user?.name ?? auth.user?.email ?? "Financeiro",
        documents: addUnique(
          selectedBillingOrder.documents,
          `${invoiceNumber} - ${formatCurrency(invoiceAmount)}`,
        ),
        notes: addUnique(
          selectedBillingOrder.notes,
          `Faturamento ${invoiceNumber} registrado em ${formatDate(now)}.`,
        ),
      },
      nextTitles,
    );

    upsertFinancialTitle(title);
    upsertOrder(updatedOrder);
    const wallet = negotiationWallets.find((item) => item.orderId === selectedBillingOrder.id);
    const remainingBeforeBilling = getRemainingBillingAmount(selectedBillingOrder, financialTitles);
    const discount = roundCurrency(remainingBeforeBilling - invoiceAmount);
    if (wallet && discount > 0) {
      upsertNegotiationWallet(
        upsertWalletEntry(
          wallet,
          createWalletEntry({
            walletId: wallet.id,
            organizationId: wallet.organizationId,
            simulationId: wallet.simulationId,
            orderId: wallet.orderId,
            entryType: "automatic",
            category: "discount_given",
            sourceModule: "financial",
            amount: discount,
            direction: "debit",
            description: "Desconto comercial ou faturamento abaixo do saldo previsto",
            referenceId: title.id,
            createdBy: auth.user?.id ?? auth.user?.email,
            metadata: { invoiceNumber, remainingBeforeBilling, invoiceAmount },
          }),
        ),
      );
    }
    setSelectedBillingOrderId(null);
    setBillingForm(createEmptyBillingForm());
    toast.success(
      updatedOrder.status === "Aguardando frete"
        ? "Faturamento concluído e pedido liberado para frete."
        : "Faturamento parcial registrado.",
    );
  };

  const handleGeneratePayables = () => {
    if (ordersWithoutPayables.length === 0) {
      toast.info("Todos os pedidos visíveis já possuem contas a pagar.");
      return;
    }

    let created = 0;
    ordersWithoutPayables.forEach((order) => {
      const titles = createPayableTitlesFromOrder(order, freights);
      titles.forEach((title) => {
        upsertFinancialTitle(title);
        created += 1;
      });
    });

    if (created === 0) {
      toast.info("Nenhuma conta a pagar foi encontrada nos pedidos visíveis.");
      return;
    }

    toast.success("Contas a pagar geradas a partir dos pedidos.");
  };

  const handleRegisterPayment = (title: FinancialTitle) => {
    const remainingAmount = getRemainingAmount(title);
    if (remainingAmount <= 0) {
      toast.info("Este título já está totalmente baixado.");
      return;
    }

    const value = window.prompt(
      `Informe o valor da baixa para ${title.titleNumber}. Saldo: ${formatCurrency(remainingAmount)}`,
      remainingAmount.toFixed(2).replace(".", ","),
    );
    if (value === null) return;

    const amount = parseCurrencyInput(value);
    if (amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (amount > remainingAmount) {
      toast.error("O valor da baixa não pode ser maior que o saldo do título.");
      return;
    }

    const paidAmount = roundCurrency(title.paidAmount + amount);
    const updatedTitle: FinancialTitle = {
      ...title,
      paidAmount,
      paidAt: paidAmount >= title.amount ? new Date().toISOString() : title.paidAt,
    };
    updatedTitle.status = getFinancialTitleStatus(updatedTitle);
    upsertFinancialTitle(updatedTitle);

    if (title.type === "receivable") {
      const relatedTitles = financialTitles
        .filter((item) => item.orderId === title.orderId && item.type === "receivable")
        .map((item) => (item.id === title.id ? updatedTitle : item));
      const order = orders.find((item) => item.id === title.orderId);
      if (order && relatedTitles.length) {
        upsertOrder(updateOrderBilling(order, relatedTitles));
      }
    }

    toast.success(
      title.type === "payable"
        ? "Baixa de pagamento registrada."
        : "Baixa de recebimento registrada.",
    );
  };

  const receivableColumns = buildFinancialColumns("Cliente", "Recebido", handleRegisterPayment);
  const payableColumns = buildFinancialColumns("Favorecido", "Pago", handleRegisterPayment);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa, contas a receber, contas a pagar e impactos financeiros das negociações."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Contas a receber"
          value={formatCurrency(totalReceive)}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          label="Contas a pagar"
          value={formatCurrency(totalPayable)}
          icon={CreditCard}
          tone="warning"
        />
        <StatCard
          label="Vencido"
          value={formatCurrency(overdue)}
          icon={ArrowDownCircle}
          tone="danger"
        />
        <StatCard
          label="Saldo projetado"
          value={formatCurrency(projectedBalance)}
          icon={Banknote}
          tone={projectedBalance >= 0 ? "success" : "danger"}
        />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Fluxo de caixa</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashflow} margin={{ left: 8, right: 12, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="var(--color-muted-foreground)"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                stroke="var(--color-muted-foreground)"
                tickFormatter={(v) => formatCompactCurrency(v as number)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                width={72}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in oklab, var(--color-primary) 8%, transparent)" }}
                formatter={(v) => formatCurrency(Number(v))}
                contentStyle={{
                  background: "var(--color-card)",
                  color: "var(--color-card-foreground)",
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-elevated)",
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{
                  fontSize: 12,
                  color: "var(--color-muted-foreground)",
                  paddingTop: 8,
                }}
              />
              <Bar
                dataKey="entradas"
                name="Entradas"
                radius={[8, 8, 0, 0]}
                fill="var(--color-primary)"
                animationDuration={800}
              />
              <Bar
                dataKey="saidas"
                name="Saídas"
                radius={[8, 8, 0, 0]}
                fill="var(--color-chart-2)"
                animationDuration={800}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Faturamento de pedidos</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Registre a NF, vencimento e valor faturado antes de liberar o pedido para separação.
            </p>
          </div>
          <ReceiptText className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable
            columns={buildBillingOrderColumns(handleSelectBillingOrder)}
            data={billableOrders}
            emptyTitle="Sem pedidos para faturar"
            emptyDescription="Pedidos faturados ou entregues não aparecem nesta fila."
          />

          {selectedBillingOrder ? (
            <div className="rounded-md border border-border bg-card/60 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Pedido selecionado</p>
                  <p className="text-base font-semibold text-foreground">
                    {selectedBillingOrder.number} • {selectedBillingOrder.client}
                  </p>
                </div>
                <StatusBadge status={selectedBillingOrder.status} />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

              <label className="mt-4 block space-y-1 text-sm font-medium">
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

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  Restante a faturar:{" "}
                  <strong className="text-foreground">
                    {formatCurrency(
                      getRemainingBillingAmount(selectedBillingOrder, financialTitles),
                    )}
                  </strong>
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedBillingOrderId(null);
                      setBillingForm(createEmptyBillingForm());
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleRegisterBilling}>
                    <FileCheck2 />
                    Registrar faturamento
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="receivable" className="space-y-4">
        <TabsList>
          <TabsTrigger value="receivable">Contas a receber</TabsTrigger>
          <TabsTrigger value="payable">Contas a pagar</TabsTrigger>
        </TabsList>

        <TabsContent value="receivable">
          <FinancialTitleCard
            title="Contas a receber"
            actionLabel="Gerar contas dos pedidos"
            onGenerate={handleGenerateReceivables}
            columns={receivableColumns}
            titles={visibleReceivables}
            emptyDescription="Não há contas a receber para exibir."
          />
        </TabsContent>

        <TabsContent value="payable">
          <FinancialTitleCard
            title="Contas a pagar"
            actionLabel="Gerar contas a pagar"
            onGenerate={handleGeneratePayables}
            columns={payableColumns}
            titles={visiblePayables}
            emptyDescription="Não há contas a pagar para exibir."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function buildFinancialColumns(
  partyLabel: string,
  paidLabel: string,
  onRegisterPayment: (title: FinancialTitle) => void,
): DataColumn<FinancialTitle>[] {
  return [
    {
      key: "doc",
      header: "Documento",
      cell: (r) => <span className="font-medium">{r.titleNumber}</span>,
    },
    { key: "client", header: partyLabel, cell: (r) => r.client },
    { key: "order", header: "Pedido", cell: (r) => r.orderNumber ?? "-" },
    { key: "due", header: "Vencimento", cell: (r) => formatDate(r.dueDate) },
    {
      key: "value",
      header: "Valor",
      className: "text-right",
      cell: (r) => <span className="font-medium">{formatCurrency(r.amount)}</span>,
    },
    {
      key: "paid",
      header: paidLabel,
      className: "text-right",
      cell: (r) => formatCurrency(r.paidAmount),
    },
    {
      key: "remaining",
      header: "Saldo",
      className: "text-right",
      cell: (r) => <span className="font-medium">{formatCurrency(getRemainingAmount(r))}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={getStatusLabel(r.status)} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          disabled={r.status === "paid" || r.status === "cancelled"}
          onClick={(event) => {
            event.stopPropagation();
            onRegisterPayment(r);
          }}
        >
          <CheckCircle2 />
          Dar baixa
        </Button>
      ),
    },
  ];
}

type BillingForm = {
  invoiceNumber: string;
  invoiceAmount: string;
  invoiceIssuedAt: string;
  billingDueDate: string;
  billingNotes: string;
};

function buildBillingOrderColumns(onSelect: (order: Order) => void): DataColumn<Order>[] {
  return [
    {
      key: "number",
      header: "Pedido",
      cell: (order) => <span className="font-semibold text-foreground">{order.number}</span>,
    },
    { key: "client", header: "Cliente", cell: (order) => order.client },
    {
      key: "value",
      header: "Valor",
      className: "text-right",
      cell: (order) => <span className="font-medium">{formatCurrency(order.totalValue)}</span>,
    },
    {
      key: "billing",
      header: "Faturado",
      cell: (order) => (
        <div className="w-32 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span>{order.billingProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${order.billingProgress}%` }}
            />
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (order) => <StatusBadge status={order.status} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (order) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(order);
          }}
        >
          <ReceiptText />
          Faturar
        </Button>
      ),
    },
  ];
}

function FinancialTitleCard({
  title,
  actionLabel,
  onGenerate,
  columns,
  titles,
  emptyDescription,
}: {
  title: string;
  actionLabel: string;
  onGenerate: () => void;
  columns: DataColumn<FinancialTitle>[];
  titles: FinancialTitle[];
  emptyDescription: string;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <Button size="sm" variant="soft" onClick={onGenerate}>
          <Plus />
          {actionLabel}
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="pending">A vencer</TabsTrigger>
            <TabsTrigger value="overdue">Vencidos</TabsTrigger>
            <TabsTrigger value="paid">Pagos</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="pt-4">
            <DataTable
              columns={columns}
              data={titles}
              emptyTitle="Sem registros"
              emptyDescription={emptyDescription}
            />
          </TabsContent>
          <TabsContent value="pending" className="pt-4">
            <DataTable
              columns={columns}
              data={titles.filter((r) => r.status === "open" || r.status === "partial")}
              emptyTitle="Sem registros"
              emptyDescription="Não há contas a vencer."
            />
          </TabsContent>
          <TabsContent value="overdue" className="pt-4">
            <DataTable
              columns={columns}
              data={titles.filter((r) => r.status === "overdue")}
              emptyTitle="Sem vencidos"
              emptyDescription="Sem contas vencidas."
            />
          </TabsContent>
          <TabsContent value="paid" className="pt-4">
            <DataTable
              columns={columns}
              data={titles.filter((r) => r.status === "paid")}
              emptyTitle="Sem pagamentos"
              emptyDescription="Sem contas pagas."
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function updateOrderBilling(order: Order, titles: FinancialTitle[]): Order {
  const billingProgress = calculateBillingProgress(titles, order.totalValue);
  const status =
    billingProgress >= 100 &&
    (order.status === "Aguardando faturamento" || order.status === "Em faturamento")
      ? "Aguardando frete"
      : billingProgress > 0 && order.status === "Aguardando faturamento"
        ? "Em faturamento"
        : order.status;

  return {
    ...order,
    billingProgress,
    status,
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

function getRemainingAmount(title: FinancialTitle) {
  return Math.max(0, roundCurrency(title.amount - title.paidAmount));
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

function buildCashflow(titles: FinancialTitle[]) {
  const byMonth = new Map<string, { month: string; entradas: number; saidas: number }>();
  titles.forEach((title) => {
    const date = new Date(title.dueDate);
    const month = Number.isNaN(date.getTime())
      ? "Sem data"
      : new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
    const current = byMonth.get(month) ?? { month, entradas: 0, saidas: 0 };
    if (title.type === "payable") {
      current.saidas += title.status === "paid" ? title.paidAmount : title.amount;
    } else {
      current.entradas += title.status === "paid" ? title.paidAmount : title.amount;
    }
    byMonth.set(month, current);
  });

  return Array.from(byMonth.values()).slice(0, 6);
}
