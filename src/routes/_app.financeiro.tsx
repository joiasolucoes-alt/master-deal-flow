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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/features/app/app-context";
import type { FinancialTitle, Order, Simulation } from "@/data/types";
import {
  calculateBillingProgress,
  areSimulationPayablesPaidWithProof,
  createPreOrderPayableTitlesFromSimulation,
  createFinancialTitlesFromOrder,
  createPayableTitlesFromOrder,
  getFinancialTitleStatus,
  getStatusLabel,
  hasPaymentProof,
  releaseOrderForFreightIfReady,
} from "@/features/finance/financialTitleHelpers";
import {
  uploadPaymentProofFile,
  validatePaymentProofFile,
} from "@/features/finance/paymentProofStorage";
import { createFreightFromOrder } from "@/features/freights/freightHelpers";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import {
  belongsToUser,
  canViewAllFlows,
  filterOrdersForUser,
  filterSimulationsForUser,
} from "@/lib/visibility";
import { canOperateBilling, canOperateFinance } from "@/lib/permissions";
import { toast } from "sonner";
import { createWalletEntry, upsertWalletEntry } from "@/features/negotiation-wallets";

export const Route = createFileRoute("/_app/financeiro")({
  component: FinancialPage,
});

function FinancialPage() {
  const {
    auth,
    simulations,
    orders,
    financialTitles,
    freights,
    negotiationWallets,
    upsertFinancialTitle,
    upsertSimulation,
    upsertOrder,
    upsertFreight,
    upsertNegotiationWallet,
    addNotification,
  } = useAppContext();
  const [selectedBillingOrderId, setSelectedBillingOrderId] = useState<string | null>(null);
  const [selectedReceivableOrderId, setSelectedReceivableOrderId] = useState<string | null>(null);
  const [selectedPayableOrderId, setSelectedPayableOrderId] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState<BillingForm>(() => createEmptyBillingForm());
  const [selectedPaymentTitle, setSelectedPaymentTitle] = useState<FinancialTitle | null>(null);
  const [paymentListSimulationId, setPaymentListSimulationId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(() => createEmptyPaymentForm());
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const canBilling = canOperateBilling(auth.user);
  const canFinance = canOperateFinance(auth.user);
  const visibleOrders = useMemo(() => filterOrdersForUser(orders, auth.user), [auth.user, orders]);
  const visibleSimulations = useMemo(
    () => filterSimulationsForUser(simulations, auth.user),
    [auth.user, simulations],
  );
  const visibleOrderIds = useMemo(
    () => new Set(visibleOrders.map((order) => order.id)),
    [visibleOrders],
  );
  const visibleSimulationIds = useMemo(
    () => new Set(visibleSimulations.map((simulation) => simulation.id)),
    [visibleSimulations],
  );
  const visibleTitles = useMemo(() => {
    return financialTitles
      .map((title) => ({ ...title, status: getFinancialTitleStatus(title) }))
      .filter((title) => {
        if (canViewAllFlows(auth.user)) return true;
        return (
          visibleOrderIds.has(title.orderId ?? "") ||
          visibleSimulationIds.has(title.simulationId ?? "") ||
          belongsToUser(title.owner, auth.user)
        );
      });
  }, [auth.user, financialTitles, visibleOrderIds, visibleSimulationIds]);
  const visibleReceivables = useMemo(
    () => visibleTitles.filter((title) => title.type === "receivable"),
    [visibleTitles],
  );
  const visiblePayables = useMemo(
    () => visibleTitles.filter((title) => title.type === "payable"),
    [visibleTitles],
  );
  const boletoTitles = useMemo(
    () =>
      visibleReceivables.filter((title) => title.kind === "boleto" || Boolean(title.invoiceNumber)),
    [visibleReceivables],
  );
  const anticipationTitles = useMemo(
    () => visibleTitles.filter((title) => title.kind === "anticipation"),
    [visibleTitles],
  );
  const extensionTitles = useMemo(
    () => visibleTitles.filter((title) => title.kind === "extension"),
    [visibleTitles],
  );
  const adjustmentTitles = useMemo(
    () => visibleTitles.filter((title) => title.kind === "return" || title.kind === "shortage"),
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
          (order.status === "Pedido confirmado" ||
            order.status === "Frete liberado" ||
            order.status === "Aguardando frete" ||
            order.status === "Aguardando faturamento" ||
            order.status === "Em faturamento") &&
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
  const negotiationPaymentRows = useMemo(
    () =>
      visibleSimulations
        .filter((simulation) =>
          [
            "Aguardando pagamento",
            "Pagamento realizado",
            "Comprovante anexado",
            "Aguardando validação comercial",
          ].includes(simulation.status),
        )
        .map((simulation) => {
          const titles = visiblePayables.filter(
            (title) => title.simulationId === simulation.id && !title.orderId,
          );
          return buildNegotiationPaymentRow(simulation, titles);
        }),
    [visiblePayables, visibleSimulations],
  );
  const receivableOrderRows = useMemo(
    () =>
      buildFinancialOrderRows(
        visibleOrders,
        visibleReceivables.filter((title) => Boolean(title.orderId)),
      ),
    [visibleOrders, visibleReceivables],
  );
  const payableOrderRows = useMemo(
    () =>
      buildFinancialOrderRows(
        visibleOrders,
        visiblePayables.filter((title) => Boolean(title.orderId)),
      ),
    [visibleOrders, visiblePayables],
  );
  const selectedReceivableOrderRow = useMemo(
    () => receivableOrderRows.find((row) => row.order.id === selectedReceivableOrderId) ?? null,
    [receivableOrderRows, selectedReceivableOrderId],
  );
  const selectedPayableOrderRow = useMemo(
    () => payableOrderRows.find((row) => row.order.id === selectedPayableOrderId) ?? null,
    [payableOrderRows, selectedPayableOrderId],
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
      kind: "boleto",
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

  const handleAnticipateTitle = (title: FinancialTitle) => {
    if (!canFinance) {
      toast.error("Seu perfil não pode registrar antecipação.");
      return;
    }
    if (title.type !== "receivable") return;
    const amountText = window.prompt(
      `Valor antecipado para ${title.titleNumber}`,
      Math.max(title.amount - title.paidAmount, 0)
        .toFixed(2)
        .replace(".", ","),
    );
    if (amountText === null) return;
    const anticipatedAmount = parseCurrencyInput(amountText);
    if (anticipatedAmount <= 0) {
      toast.error("Informe um valor antecipado maior que zero.");
      return;
    }
    const costText = window.prompt("Custo da antecipação", "0,00");
    if (costText === null) return;
    const anticipationCost = parseCurrencyInput(costText);
    const bankName = window.prompt("Banco da antecipação", title.bankName || "") ?? title.bankName;
    const now = new Date().toISOString();
    const updatedTitle: FinancialTitle = {
      ...title,
      anticipatedAmount,
      anticipationCost,
      bankName,
      notes: addUniqueText(
        title.notes,
        `Antecipação registrada em ${formatDate(now)} no banco ${bankName || "-"}.`,
      ),
    };
    upsertFinancialTitle(updatedTitle);
    if (anticipationCost > 0) {
      upsertFinancialTitle({
        id: `fin-ant-${title.id}-${Date.now()}`,
        parentTitleId: title.id,
        orderId: title.orderId,
        orderNumber: title.orderNumber,
        simulationId: title.simulationId,
        simulationNumber: title.simulationNumber,
        client: bankName || "Banco da antecipação",
        titleNumber: `${title.titleNumber}-ANT`,
        type: "payable",
        kind: "anticipation",
        status: "open",
        dueDate: now,
        amount: anticipationCost,
        paidAmount: 0,
        anticipatedAmount,
        anticipationCost,
        costOwner: "Master",
        costReason: "Custo financeiro de antecipação de boleto.",
        paymentMethod: "Débito bancário",
        bankName,
        notes: `Custo de antecipação vinculado ao boleto ${title.titleNumber}.`,
        owner: title.owner,
        unit: title.unit,
        createdAt: now,
      });
    }
    toast.success("Antecipação registrada.");
  };

  const handleExtendTitle = (title: FinancialTitle) => {
    if (!canFinance) {
      toast.error("Seu perfil não pode registrar prorrogação.");
      return;
    }
    const nextDueDate = window.prompt(
      "Nova data de vencimento (AAAA-MM-DD)",
      title.dueDate.slice(0, 10),
    );
    if (!nextDueDate) return;
    const costText = window.prompt("Custo da prorrogação", "0,00");
    if (costText === null) return;
    const extensionCost = parseCurrencyInput(costText);
    const reason = window.prompt("Motivo da prorrogação", "") ?? "";
    const now = new Date().toISOString();
    const updatedTitle: FinancialTitle = {
      ...title,
      originalDueDate: title.originalDueDate ?? title.dueDate,
      extendedDueDate: dateInputToIso(nextDueDate),
      dueDate: dateInputToIso(nextDueDate),
      extensionCost,
      costReason: reason,
      notes: addUniqueText(
        title.notes,
        `Prorrogado para ${formatDate(dateInputToIso(nextDueDate))}.`,
      ),
    };
    upsertFinancialTitle(updatedTitle);
    if (extensionCost > 0) {
      upsertFinancialTitle({
        id: `fin-ext-${title.id}-${Date.now()}`,
        parentTitleId: title.id,
        orderId: title.orderId,
        orderNumber: title.orderNumber,
        simulationId: title.simulationId,
        simulationNumber: title.simulationNumber,
        client: "Custo de prorrogação",
        titleNumber: `${title.titleNumber}-PROR`,
        type: "payable",
        kind: "extension",
        status: "open",
        dueDate: now,
        amount: extensionCost,
        paidAmount: 0,
        extensionCost,
        costOwner: "Master",
        costReason: reason || "Custo por prorrogação de boleto.",
        paymentMethod: "A definir",
        bankName: title.bankName,
        notes: `Custo de prorrogação vinculado ao título ${title.titleNumber}.`,
        owner: title.owner,
        unit: title.unit,
        createdAt: now,
      });
    }
    toast.success("Prorrogação registrada.");
  };

  const handleCreateReturnOrShortage = () => {
    if (!canFinance) {
      toast.error("Seu perfil não pode abrir devolução/falta.");
      return;
    }
    const kind = window.confirm(
      "Clique OK para Falta de mercadoria. Clique Cancelar para Devolução.",
    )
      ? "shortage"
      : "return";
    const client = window.prompt("Cliente ou responsável", "")?.trim();
    if (!client) return;
    const amountText = window.prompt("Valor a controlar", "0,00");
    if (amountText === null) return;
    const amount = parseCurrencyInput(amountText);
    if (amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    const costOwner =
      (window.prompt(
        "Quem vai custear? Master, Comercial, Transportadora, Cliente, Fornecedor ou Outro",
        "Master",
      ) as FinancialTitle["costOwner"]) || "Master";
    const reason = window.prompt("Motivo", "") ?? "";
    const now = new Date().toISOString();
    upsertFinancialTitle({
      id: `fin-${kind}-${Date.now()}`,
      client,
      titleNumber: `${kind === "shortage" ? "FALTA" : "DEV"}-${Date.now().toString().slice(-6)}`,
      type: "payable",
      kind,
      status: "open",
      dueDate: now,
      amount,
      paidAmount: 0,
      costOwner,
      costReason: reason,
      paymentMethod: "A definir",
      bankName: "",
      notes: reason || (kind === "shortage" ? "Falta de mercadoria." : "Devolução de mercadoria."),
      owner: auth.user?.name ?? auth.user?.email ?? "Financeiro",
      unit: auth.user?.unit ?? "Todas as unidades",
      createdAt: now,
    });
    toast.success("Controle financeiro criado.");
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

  const handleGenerateNegotiationPayment = (row: NegotiationPaymentRow) => {
    if (row.payables.length > 0) {
      toast.info("Esta negociação já possui pagamentos gerados.");
      return row.payables;
    }

    const titles = createPreOrderPayableTitlesFromSimulation(row.simulation);
    if (titles.length === 0) {
      toast.info("Nenhum pagamento previsto foi encontrado para esta negociação.");
      return [];
    }

    titles.forEach(upsertFinancialTitle);
    toast.success(`${titles.length} pagamento(s) gerado(s) para ${row.simulation.number}.`);
    return titles;
  };

  // §12 — "Fazer pagamento": em vez de abrir um lançamento aleatório, abre um modal
  // com TODOS os lançamentos a pagar da simulação, para o Financeiro escolher qual pagar.
  const handlePayNegotiation = (row: NegotiationPaymentRow) => {
    const payables = row.payables.length ? row.payables : handleGenerateNegotiationPayment(row);
    if (!payables.length) return;
    setPaymentListSimulationId(row.simulation.id);
  };

  const openPaymentDialog = (title: FinancialTitle) => {
    const remainingAmount = getRemainingAmount(title);
    if (remainingAmount <= 0) {
      toast.info("Este título já está totalmente baixado.");
      return;
    }

    setSelectedPaymentTitle(title);
    setPaymentForm({
      amount: formatCurrencyInput(remainingAmount),
      proofFile: null,
    });
  };

  const handleRegisterPayment = async (title: FinancialTitle, options?: PaymentProofOptions) => {
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
    const paidAt = paidAmount >= title.amount ? new Date().toISOString() : title.paidAt;
    let proofFileName = options?.proofFileName ?? title.proofFileName;
    const proofFilePath = options?.proofFilePath ?? title.proofFilePath;
    let proofAttachedAt = options?.proofAttachedAt ?? title.proofAttachedAt;
    let proofAttachedBy = options?.proofAttachedBy ?? title.proofAttachedBy;

    if (title.type === "payable" && paidAmount >= title.amount && !hasPaymentProof(title)) {
      const proof = window.prompt(
        "Informe o nome ou referência do comprovante de pagamento.",
        title.proofFileName ?? "",
      );
      if (!proof?.trim()) {
        toast.error("Informe o comprovante para concluir o pagamento da proposta.");
        return;
      }
      proofFileName = proof.trim();
      proofAttachedAt = paidAt;
      proofAttachedBy = auth.user?.name ?? auth.user?.email ?? "Financeiro";
    }

    const updatedTitle: FinancialTitle = {
      ...title,
      paidAmount,
      paidAt,
      proofFileName,
      proofFilePath,
      proofAttachedAt,
      proofAttachedBy,
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
    } else if (title.simulationId && !title.orderId) {
      const nextTitles = upsertTitleInMemory(financialTitles, updatedTitle);
      const simulation = simulations.find((item) => item.id === title.simulationId);
      if (simulation && areSimulationPayablesPaidWithProof(simulation, nextTitles)) {
        upsertSimulation({
          ...simulation,
          status: "Aguardando validação comercial",
          paymentPaidAt: paidAt,
          paymentPaidBy: auth.user?.name ?? auth.user?.email ?? "Financeiro",
          paymentReceiptFileName: updatedTitle.proofFileName,
          paymentReceiptFilePath: updatedTitle.proofFilePath,
          paymentReceiptAttachedAt: updatedTitle.proofAttachedAt,
          paymentReceiptAttachedBy: updatedTitle.proofAttachedBy,
          paymentAdjustmentReason: undefined,
        });
        addNotification({
          id: `not-${Date.now()}-payment-proof`,
          title: "Comprovante de pagamento anexado",
          description: `${simulation.number} aguarda validação comercial para virar pedido.`,
          type: "success",
          createdAt: new Date().toISOString(),
          unread: true,
          entityType: "simulation",
          entityId: simulation.id,
          targetUserName: simulation.owner,
          targetRole: "Comercial",
        });
      }
    } else {
      const nextTitles = upsertTitleInMemory(financialTitles, updatedTitle);
      const order = orders.find((item) => item.id === title.orderId);
      if (order) {
        const releasedOrder = releaseOrderForFreightIfReady(order, nextTitles);
        if (releasedOrder.status !== order.status) {
          upsertOrder(releasedOrder);
          if (!freights.some((freight) => freight.orderId === order.id)) {
            upsertFreight(createFreightFromOrder(releasedOrder));
          }
          addNotification({
            id: `not-${Date.now()}-commercial-release`,
            title: "Financeiro liberou a operação",
            description: `${order.number} foi liberado para o fluxo de frete.`,
            type: "success",
            createdAt: new Date().toISOString(),
            unread: true,
            entityType: "order",
            entityId: order.id,
            targetUserName: order.owner,
            targetRole: "Comercial",
          });
          addNotification({
            id: `not-${Date.now()}-freight-release`,
            title: "Frete liberado para execução",
            description: `${order.number} foi liberado e já pode avançar no módulo de Fretes.`,
            type: "success",
            createdAt: new Date().toISOString(),
            unread: true,
            entityType: "order",
            entityId: order.id,
            targetRole: "Frete",
          });
        }
      }
    }

    toast.success(
      title.type === "payable"
        ? "Baixa de pagamento registrada."
        : "Baixa de recebimento registrada.",
    );
  };

  const handleRegisterNegotiationPayment = async () => {
    if (!selectedPaymentTitle) return;

    const remainingAmount = getRemainingAmount(selectedPaymentTitle);
    const amount = parseCurrencyInput(paymentForm.amount);

    if (amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (roundCurrency(amount) !== roundCurrency(remainingAmount)) {
      toast.error("Para liberar a validação comercial, pague o saldo completo da negociação.");
      return;
    }
    if (!paymentForm.proofFile) {
      toast.error("Anexe o comprovante antes de marcar pagamento realizado.");
      return;
    }

    const validationMessage = validatePaymentProofFile(paymentForm.proofFile);
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setPaymentSubmitting(true);
    try {
      const uploadedProof = await uploadPaymentProofFile({
        titleId: selectedPaymentTitle.id,
        file: paymentForm.proofFile,
      });
      const paidAt = new Date().toISOString();
      const updatedTitle: FinancialTitle = {
        ...selectedPaymentTitle,
        paidAmount: selectedPaymentTitle.amount,
        paidAt,
        proofFileName: uploadedProof.proofFileName,
        proofFilePath: uploadedProof.proofFilePath,
        proofAttachedAt: paidAt,
        proofAttachedBy: auth.user?.name ?? auth.user?.email ?? "Financeiro",
      };
      updatedTitle.status = getFinancialTitleStatus(updatedTitle);
      upsertFinancialTitle(updatedTitle);

      if (selectedPaymentTitle.simulationId && !selectedPaymentTitle.orderId) {
        const nextTitles = upsertTitleInMemory(financialTitles, updatedTitle);
        const simulation = simulations.find(
          (item) => item.id === selectedPaymentTitle.simulationId,
        );
        if (simulation) {
          const fullyPaidWithProof = areSimulationPayablesPaidWithProof(simulation, nextTitles);
          upsertSimulation({
            ...simulation,
            status: fullyPaidWithProof ? "Aguardando validação comercial" : "Pagamento realizado",
            paymentPaidAt: paidAt,
            paymentPaidBy: auth.user?.name ?? auth.user?.email ?? "Financeiro",
            paymentReceiptFileName: uploadedProof.proofFileName,
            paymentReceiptFilePath: uploadedProof.proofFilePath,
            paymentReceiptAttachedAt: paidAt,
            paymentReceiptAttachedBy: auth.user?.name ?? auth.user?.email ?? "Financeiro",
            paymentAdjustmentReason: undefined,
          });
          addNotification({
            id: `not-${Date.now()}-payment-proof`,
            title: fullyPaidWithProof
              ? "Comprovante aguardando validação"
              : "Pagamento registrado na negociação",
            description: fullyPaidWithProof
              ? `${simulation.number} teve todos os pagamentos realizados. Valide o comprovante para virar pedido.`
              : `${simulation.number} teve pagamento registrado pelo Financeiro e ainda possui saldo pendente.`,
            type: "success",
            createdAt: new Date().toISOString(),
            unread: true,
            entityType: "simulation",
            entityId: simulation.id,
            targetUserName: simulation.owner,
            targetRole: "Comercial",
          });
        }
      }

      const updatedTitles = upsertTitleInMemory(financialTitles, updatedTitle);
      const relatedSimulation = selectedPaymentTitle.simulationId
        ? simulations.find((item) => item.id === selectedPaymentTitle.simulationId)
        : null;
      const fullyPaidWithProof = relatedSimulation
        ? areSimulationPayablesPaidWithProof(relatedSimulation, updatedTitles)
        : false;
      toast.success(
        fullyPaidWithProof
          ? "Pagamento realizado. Aguardando validação comercial."
          : "Pagamento registrado. A negociação ainda possui saldo pendente.",
      );
      setSelectedPaymentTitle(null);
      setPaymentForm(createEmptyPaymentForm());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível anexar o comprovante.",
      );
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const receivableColumns = buildFinancialColumns("Cliente", "Recebido", handleRegisterPayment);
  const payableColumns = buildFinancialColumns("Favorecido", "Pago", handleRegisterPayment);
  const receivableOrderColumns = buildFinancialOrderColumns(
    "Receber",
    setSelectedReceivableOrderId,
  );
  const payableOrderColumns = buildFinancialOrderColumns("Pagar", setSelectedPayableOrderId);
  const negotiationPaymentColumns = buildNegotiationPaymentColumns(
    handleGenerateNegotiationPayment,
    handlePayNegotiation,
  );

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

      <Tabs defaultValue="negotiation-payment" className="space-y-4">
        <TabsList>
          <TabsTrigger value="negotiation-payment">Pagamento de negociação</TabsTrigger>
          <TabsTrigger value="receivable">Contas a receber</TabsTrigger>
          <TabsTrigger value="payable">Contas a pagar</TabsTrigger>
        </TabsList>

        <TabsContent value="negotiation-payment">
          <Card className="shadow-card">
            <CardHeader className="space-y-1">
              <CardTitle>Pagamento de negociação</CardTitle>
              <p className="text-sm text-muted-foreground">
                Propostas aprovadas pelo Gestor entram aqui para o Financeiro pagar e informar o
                comprovante antes da validação comercial.
              </p>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={negotiationPaymentColumns}
                data={negotiationPaymentRows}
                emptyTitle="Sem negociações aguardando pagamento"
                emptyDescription="Quando o Gestor aprovar uma proposta, ela aparecerá nesta fila."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receivable">
          <div className="space-y-4">
            <FinancialOrderCard
              title="Pedidos com contas a receber"
              description="Clique em um pedido para ver e baixar somente os recebimentos dele."
              actionLabel="Gerar contas dos pedidos"
              onGenerate={handleGenerateReceivables}
              columns={receivableOrderColumns}
              rows={receivableOrderRows}
              selectedOrderId={selectedReceivableOrderId}
              onSelect={setSelectedReceivableOrderId}
              emptyDescription="Não há pedidos com contas a receber para exibir."
            />
            {selectedReceivableOrderRow ? (
              <FinancialTitleCard
                title={`Contas a receber — ${selectedReceivableOrderRow.order.number}`}
                actionLabel="Gerar contas dos pedidos"
                onGenerate={handleGenerateReceivables}
                columns={receivableColumns}
                titles={selectedReceivableOrderRow.titles}
                emptyDescription="Este pedido ainda não possui contas a receber."
                hideAction
              />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="payable">
          <div className="space-y-4">
            <FinancialOrderCard
              title="Pedidos com contas a pagar"
              description="Clique em um pedido para ver e baixar somente os pagamentos dele."
              actionLabel="Gerar contas a pagar"
              onGenerate={handleGeneratePayables}
              columns={payableOrderColumns}
              rows={payableOrderRows}
              selectedOrderId={selectedPayableOrderId}
              onSelect={setSelectedPayableOrderId}
              emptyDescription="Não há pedidos com contas a pagar para exibir."
            />
            {selectedPayableOrderRow ? (
              <FinancialTitleCard
                title={`Contas a pagar — ${selectedPayableOrderRow.order.number}`}
                actionLabel="Gerar contas a pagar"
                onGenerate={handleGeneratePayables}
                columns={payableColumns}
                titles={selectedPayableOrderRow.titles}
                emptyDescription="Este pedido ainda não possui contas a pagar."
                hideAction
              />
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Gestão financeira</CardTitle>
          <p className="text-sm text-muted-foreground">
            Submenus para boleto, antecipação, prorrogação e devolução/falta de mercadoria.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="boletos" className="space-y-4">
            <TabsList className="flex w-full flex-wrap justify-start">
              <TabsTrigger value="boletos">Boletos / faturamento</TabsTrigger>
              <TabsTrigger value="antecipacao">Antecipação</TabsTrigger>
              <TabsTrigger value="prorrogacao">Prorrogação</TabsTrigger>
              <TabsTrigger value="devolucao">Devoluções / faltas</TabsTrigger>
            </TabsList>
            <TabsContent value="boletos">
              <DataTable
                columns={buildBoletoColumns(
                  handleAnticipateTitle,
                  handleExtendTitle,
                  canBilling || canFinance,
                )}
                data={boletoTitles}
                emptyTitle="Sem boletos faturados"
                emptyDescription="Registre o faturamento para gerar boletos/contas a receber."
              />
            </TabsContent>
            <TabsContent value="antecipacao">
              <DataTable
                columns={buildFinancialEventColumns("Custo de antecipação")}
                data={anticipationTitles}
                emptyTitle="Sem antecipações"
                emptyDescription="Use a ação Antecipar em um boleto para registrar custo financeiro."
              />
            </TabsContent>
            <TabsContent value="prorrogacao">
              <DataTable
                columns={buildFinancialEventColumns("Custo de prorrogação")}
                data={extensionTitles}
                emptyTitle="Sem prorrogações"
                emptyDescription="Use a ação Prorrogar em um boleto ou título para registrar o custo."
              />
            </TabsContent>
            <TabsContent value="devolucao" className="space-y-3">
              <div className="flex justify-end">
                <Button onClick={handleCreateReturnOrShortage} disabled={!canFinance}>
                  <Plus />
                  Abrir devolução/falta
                </Button>
              </div>
              <DataTable
                columns={buildFinancialEventColumns("Responsável pelo custo")}
                data={adjustmentTitles}
                emptyTitle="Sem devoluções ou faltas"
                emptyDescription="Abra um controle quando houver devolução, falta ou diferença de mercadoria."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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
                  <Button onClick={handleRegisterBilling} disabled={!canBilling}>
                    <FileCheck2 />
                    Registrar faturamento
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(paymentListSimulationId)}
        onOpenChange={(open) => {
          if (open) return;
          setPaymentListSimulationId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fazer pagamento — lançamentos a pagar</DialogTitle>
            <DialogDescription>
              Escolha qual conta a pagar da negociação deseja quitar. Cada item é pago
              individualmente, com o seu comprovante.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const row = negotiationPaymentRows.find(
              (item) => item.simulation.id === paymentListSimulationId,
            );
            if (!row) {
              return (
                <p className="text-sm text-muted-foreground">
                  Nenhum lançamento a pagar encontrado para esta negociação.
                </p>
              );
            }
            return (
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-card/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Negociação</span>
                    <strong>{row.simulation.number}</strong>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Cliente</span>
                    <strong>{row.simulation.client}</strong>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Saldo total</span>
                    <strong>{formatCurrency(row.remainingAmount)}</strong>
                  </div>
                </div>
                <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                  {row.payables.map((title) => {
                    const remaining = getRemainingAmount(title);
                    const settled = title.status === "paid" || title.status === "cancelled";
                    return (
                      <div key={title.id} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold">{getPayableTypeLabel(title)}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {title.notes || title.titleNumber}
                            </p>
                          </div>
                          <StatusBadge status={getStatusLabel(title.status)} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                          <span className="text-muted-foreground">
                            Documento: <span className="text-foreground">{title.titleNumber}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Vencimento:{" "}
                            <span className="text-foreground">{formatDate(title.dueDate)}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Comprovante:{" "}
                            <span className="text-foreground">
                              {hasPaymentProof(title) ? "Anexado" : "—"}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Previsto:{" "}
                            <span className="text-foreground">{formatCurrency(title.amount)}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Pago:{" "}
                            <span className="text-foreground">
                              {formatCurrency(title.paidAmount)}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Saldo:{" "}
                            <span className="font-medium text-foreground">
                              {formatCurrency(remaining)}
                            </span>
                          </span>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={settled || remaining <= 0}
                            onClick={() => openPaymentDialog(title)}
                          >
                            <CheckCircle2 />
                            {settled ? "Pago" : "Pagar este item"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentListSimulationId(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedPaymentTitle)}
        onOpenChange={(open) => {
          if (open || paymentSubmitting) return;
          setSelectedPaymentTitle(null);
          setPaymentForm(createEmptyPaymentForm());
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pagamento da negociação</DialogTitle>
            <DialogDescription>
              Anexe o comprovante e confirme o pagamento para enviar ao Comercial validar.
            </DialogDescription>
          </DialogHeader>

          {selectedPaymentTitle ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-card/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Negociação</span>
                  <strong>{selectedPaymentTitle.simulationNumber}</strong>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Documento</span>
                  <strong>{selectedPaymentTitle.titleNumber}</strong>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Saldo</span>
                  <strong>{formatCurrency(getRemainingAmount(selectedPaymentTitle))}</strong>
                </div>
              </div>

              <label className="block space-y-1 text-sm font-medium">
                <span>Valor da baixa</span>
                <Input
                  value={paymentForm.amount}
                  onChange={(event) =>
                    setPaymentForm((current) => ({ ...current, amount: event.target.value }))
                  }
                  placeholder="0,00"
                />
                <span className="block text-xs text-muted-foreground">
                  Para esta etapa, o pagamento precisa quitar o saldo completo da negociação.
                </span>
              </label>

              <label className="block space-y-1 text-sm font-medium">
                <span>Comprovante</span>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPaymentForm((current) => ({ ...current, proofFile: file }));
                  }}
                />
                <span className="block text-xs text-muted-foreground">
                  PDF, JPG ou PNG até 10 MB.
                </span>
              </label>

              {paymentForm.proofFile ? (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <span className="text-muted-foreground">Arquivo selecionado: </span>
                  <strong>{paymentForm.proofFile.name}</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={paymentSubmitting}
              onClick={() => {
                setSelectedPaymentTitle(null);
                setPaymentForm(createEmptyPaymentForm());
              }}
            >
              Cancelar
            </Button>
            <Button disabled={paymentSubmitting} onClick={handleRegisterNegotiationPayment}>
              <FileCheck2 />
              {paymentSubmitting ? "Registrando..." : "Pagamento realizado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    {
      key: "order",
      header: "Pedido/Proposta",
      cell: (r) => r.orderNumber ?? r.simulationNumber ?? "-",
    },
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

function buildBoletoColumns(
  onAnticipate: (title: FinancialTitle) => void,
  onExtend: (title: FinancialTitle) => void,
  canManage: boolean,
): DataColumn<FinancialTitle>[] {
  return [
    { key: "doc", header: "Boleto/NF", cell: (row) => row.titleNumber },
    { key: "client", header: "Cliente", cell: (row) => row.client },
    { key: "order", header: "Pedido", cell: (row) => row.orderNumber ?? "-" },
    { key: "due", header: "Vencimento", cell: (row) => formatDate(row.dueDate) },
    {
      key: "amount",
      header: "Valor",
      className: "text-right",
      cell: (row) => formatCurrency(row.amount),
    },
    {
      key: "bank",
      header: "Banco",
      cell: (row) => row.bankName || "-",
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={getStatusLabel(row.status)} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canManage || row.status === "paid" || row.status === "cancelled"}
            onClick={(event) => {
              event.stopPropagation();
              onAnticipate(row);
            }}
          >
            Antecipar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canManage || row.status === "paid" || row.status === "cancelled"}
            onClick={(event) => {
              event.stopPropagation();
              onExtend(row);
            }}
          >
            Prorrogar
          </Button>
        </div>
      ),
    },
  ];
}

function buildFinancialEventColumns(extraLabel: string): DataColumn<FinancialTitle>[] {
  return [
    { key: "doc", header: "Documento", cell: (row) => row.titleNumber },
    { key: "client", header: "Favorecido/Cliente", cell: (row) => row.client },
    {
      key: "ref",
      header: "Referência",
      cell: (row) => row.orderNumber ?? row.simulationNumber ?? row.parentTitleId ?? "-",
    },
    { key: "due", header: "Vencimento", cell: (row) => formatDate(row.dueDate) },
    {
      key: "amount",
      header: "Valor",
      className: "text-right",
      cell: (row) => formatCurrency(row.amount),
    },
    {
      key: "extra",
      header: extraLabel,
      cell: (row) =>
        row.costOwner ??
        (row.anticipationCost ? formatCurrency(row.anticipationCost) : undefined) ??
        (row.extensionCost ? formatCurrency(row.extensionCost) : undefined) ??
        "-",
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={getStatusLabel(row.status)} />,
    },
  ];
}

type NegotiationPaymentRow = {
  simulation: Simulation;
  payables: FinancialTitle[];
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate?: string;
  proofStatus: string;
  status: string;
};

type FinancialOrderRow = {
  order: Order;
  titles: FinancialTitle[];
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  openTitles: number;
  status: string;
};

function buildFinancialOrderRows(orders: Order[], titles: FinancialTitle[]): FinancialOrderRow[] {
  return orders
    .map((order) => {
      const orderTitles = titles.filter((title) => title.orderId === order.id);
      const amount = roundCurrency(orderTitles.reduce((sum, title) => sum + title.amount, 0));
      const paidAmount = roundCurrency(
        orderTitles.reduce((sum, title) => sum + Math.min(title.paidAmount, title.amount), 0),
      );
      const remainingAmount = Math.max(0, roundCurrency(amount - paidAmount));
      const openTitles = orderTitles.filter(
        (title) => title.status !== "paid" && title.status !== "cancelled",
      ).length;

      return {
        order,
        titles: orderTitles,
        amount,
        paidAmount,
        remainingAmount,
        openTitles,
        status: openTitles === 0 && orderTitles.length > 0 ? "Quitado" : "Em aberto",
      };
    })
    .filter((row) => row.titles.length > 0);
}

function buildFinancialOrderColumns(
  actionLabel: string,
  onSelect: (orderId: string) => void,
): DataColumn<FinancialOrderRow>[] {
  return [
    {
      key: "order",
      header: "Pedido",
      cell: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.order.number}</p>
          <p className="text-xs text-muted-foreground">{row.order.client}</p>
        </div>
      ),
    },
    { key: "owner", header: "Comercial", cell: (row) => row.order.owner },
    {
      key: "amount",
      header: "Valor previsto",
      className: "text-right",
      cell: (row) => <span className="font-medium">{formatCurrency(row.amount)}</span>,
    },
    {
      key: "paid",
      header: "Baixado",
      className: "text-right",
      cell: (row) => formatCurrency(row.paidAmount),
    },
    {
      key: "remaining",
      header: "Saldo",
      className: "text-right",
      cell: (row) => <span className="font-medium">{formatCurrency(row.remainingAmount)}</span>,
    },
    {
      key: "titles",
      header: "Títulos",
      cell: (row) => `${row.openTitles}/${row.titles.length} em aberto`,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(row.order.id);
          }}
        >
          {actionLabel}
        </Button>
      ),
    },
  ];
}

function buildNegotiationPaymentColumns(
  onGeneratePayment: (row: NegotiationPaymentRow) => void,
  onPay: (row: NegotiationPaymentRow) => void,
): DataColumn<NegotiationPaymentRow>[] {
  return [
    {
      key: "number",
      header: "Negociação",
      cell: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.simulation.number}</p>
          <p className="text-xs text-muted-foreground">{row.simulation.supplier}</p>
        </div>
      ),
    },
    { key: "client", header: "Cliente", cell: (row) => row.simulation.client },
    { key: "owner", header: "Comercial", cell: (row) => row.simulation.owner },
    {
      key: "due",
      header: "Vencimento",
      cell: (row) => (row.dueDate ? formatDate(row.dueDate) : "Gerar pagamentos"),
    },
    {
      key: "value",
      header: "Valor previsto",
      className: "text-right",
      cell: (row) => <span className="font-medium">{formatCurrency(row.amount)}</span>,
    },
    {
      key: "paid",
      header: "Pago",
      className: "text-right",
      cell: (row) => formatCurrency(row.paidAmount),
    },
    {
      key: "remaining",
      header: "Saldo",
      className: "text-right",
      cell: (row) => <span className="font-medium">{formatCurrency(row.remainingAmount)}</span>,
    },
    {
      key: "proof",
      header: "Comprovante",
      cell: (row) => row.proofStatus,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) => (
        <Button
          size="sm"
          variant={row.payables.length ? "outline" : "soft"}
          disabled={row.remainingAmount <= 0 && row.payables.length > 0}
          onClick={(event) => {
            event.stopPropagation();
            if (row.payables.length) {
              onPay(row);
            } else {
              onGeneratePayment(row);
            }
          }}
        >
          {row.payables.length ? <CheckCircle2 /> : <Plus />}
          {row.payables.length ? "Fazer pagamento" : "Gerar pagamentos"}
        </Button>
      ),
    },
  ];
}

// Deriva um rótulo de "tipo" do lançamento a partir do número do título (sufixo
// após "PAG-") para exibir no modal "Fazer pagamento".
function getPayableTypeLabel(title: FinancialTitle): string {
  const suffix = title.titleNumber.split("PAG-")[1]?.toUpperCase() ?? "";
  const map: Record<string, string> = {
    MERC: "Mercadoria",
    FRETE: "Frete",
    COMISSAO: "Comissão",
    "CUSTO-NF": "Custo NF",
    "CUSTO-FISCAL": "Custo fiscal",
    FINANCEIRO: "Financeiro",
    SEGURO: "Seguro",
    PALLETS: "Pallets",
    TRIBUTOS: "Tributos",
  };
  if (map[suffix]) return map[suffix];
  if (suffix.startsWith("MERC")) return "Mercadoria";
  return "Conta a pagar";
}

function buildNegotiationPaymentRow(
  simulation: Simulation,
  payables: FinancialTitle[],
): NegotiationPaymentRow {
  const referencePayables = payables.length
    ? payables
    : createPreOrderPayableTitlesFromSimulation(simulation);
  const amount = roundCurrency(referencePayables.reduce((sum, title) => sum + title.amount, 0));
  const paidAmount = roundCurrency(
    payables.reduce((sum, title) => sum + Math.min(title.paidAmount, title.amount), 0),
  );
  const remainingAmount = Math.max(0, roundCurrency(amount - paidAmount));
  const sortedDueDates = referencePayables
    .map((title) => title.dueDate)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const proofCount = payables.filter(hasPaymentProof).length;
  const paidCount = payables.filter((title) => title.status === "paid").length;
  const status =
    payables.length === 0
      ? "Aguardando pagamento"
      : remainingAmount <= 0 && proofCount === payables.length
        ? "Aguardando validação comercial"
        : paidCount > 0
          ? "Pagamento realizado"
          : "Aguardando pagamento";

  return {
    simulation,
    payables,
    amount,
    paidAmount,
    remainingAmount,
    dueDate: sortedDueDates[0],
    proofStatus:
      payables.length === 0 ? "Pendente" : `${proofCount}/${payables.length} comprovante(s)`,
    status,
  };
}

type BillingForm = {
  invoiceNumber: string;
  invoiceAmount: string;
  invoiceIssuedAt: string;
  billingDueDate: string;
  billingNotes: string;
};

type PaymentForm = {
  amount: string;
  proofFile: File | null;
};

type PaymentProofOptions = {
  proofFileName?: string;
  proofFilePath?: string;
  proofAttachedAt?: string;
  proofAttachedBy?: string;
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
  hideAction = false,
}: {
  title: string;
  actionLabel: string;
  onGenerate: () => void;
  columns: DataColumn<FinancialTitle>[];
  titles: FinancialTitle[];
  emptyDescription: string;
  hideAction?: boolean;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        {hideAction ? null : (
          <Button size="sm" variant="soft" onClick={onGenerate}>
            <Plus />
            {actionLabel}
          </Button>
        )}
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

function FinancialOrderCard({
  title,
  description,
  actionLabel,
  onGenerate,
  columns,
  rows,
  selectedOrderId,
  onSelect,
  emptyDescription,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onGenerate: () => void;
  columns: DataColumn<FinancialOrderRow>[];
  rows: FinancialOrderRow[];
  selectedOrderId: string | null;
  onSelect: (orderId: string) => void;
  emptyDescription: string;
}) {
  const selectedOrder = rows.find((row) => row.order.id === selectedOrderId);

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {selectedOrder ? (
            <p className="mt-2 text-xs font-medium text-primary">
              Selecionado: {selectedOrder.order.number} • {selectedOrder.order.client}
            </p>
          ) : null}
        </div>
        <Button size="sm" variant="soft" onClick={onGenerate}>
          <Plus />
          {actionLabel}
        </Button>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          onRowClick={(row) => onSelect(row.order.id)}
          emptyTitle="Sem pedidos"
          emptyDescription={emptyDescription}
        />
      </CardContent>
    </Card>
  );
}

function updateOrderBilling(order: Order, titles: FinancialTitle[]): Order {
  // Regra (fix: separate freight release from financial invoicing): o faturamento
  // é uma frente paralela e NÃO altera o status operacional do pedido (que segue
  // sendo controlado pela conversão e pelo avanço do frete). Aqui só atualizamos o
  // progresso de faturamento; o rótulo "Aguardando faturamento/Faturado" é derivado.
  const billingProgress = calculateBillingProgress(titles, order.totalValue);
  return {
    ...order,
    billingProgress,
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

function createEmptyPaymentForm(): PaymentForm {
  return {
    amount: "",
    proofFile: null,
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

function addUniqueText(current: string, value: string) {
  if (current.includes(value)) return current;
  return current ? `${current} ${value}` : value;
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
