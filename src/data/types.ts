export type ThemeMode = "light" | "dark" | "system";
export type UserRole = "Comercial" | "Negociações" | "Aprovador" | "Financeiro" | "Frete" | "Admin";
export type UserStatus = "Pendente" | "Ativo" | "Bloqueado";

export type AppStatus =
  | "Rascunho"
  | "Em análise"
  | "Pendente de aprovação"
  | "Aguardando financeiro"
  | "Aguardando aprovação do Gestor"
  | "Aguardando pagamento"
  | "Pagamento realizado"
  | "Comprovante anexado"
  | "Aguardando validação comercial"
  | "Validada pelo comercial"
  | "Aprovada"
  | "Reprovada"
  | "Ajuste solicitado"
  | "Pedido confirmado"
  | "Aguardando faturamento"
  | "Em faturamento"
  | "Aguardando frete"
  | "Frete liberado"
  | "Aguardando carregamento"
  | "Em carregamento"
  | "Em separação"
  | "Em rota"
  | "No destino"
  | "Mercadoria descarregada"
  | "Entregue"
  | "Finalizada"
  | "Cancelada";

export type Priority = "Baixa" | "Média" | "Alta" | "Crítica";
export type Viability = "Pendente" | "Viável" | "Atenção" | "Inviável";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  password?: string;
  unit: string;
  initials: string;
  avatarHue: string;
  status: UserStatus;
  emailConfirmed: boolean;
  createdAt?: string;
  approvedAt?: string;
}

export interface Client {
  id: string;
  code?: string;
  name: string;
  document?: string;
  city: string;
  state: string;
  unit: string;
  active?: boolean;
}

export interface Supplier {
  id: string;
  code?: string;
  name: string;
  document?: string;
  city: string;
  state: string;
  active?: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  brand?: string;
  category?: string;
  unitLabel: string;
  defaultUnitsPerBox: number;
  costUnit: number;
  saleUnit: number;
  active?: boolean;
}

export interface NotificationItem {
  id: string;
  remoteId?: string;
  title: string;
  description: string;
  type: "info" | "warning" | "success";
  createdAt: string;
  unread: boolean;
  href?: string;
  entityType?: "approval" | "delivery" | "freight" | "simulation" | "order" | "negotiation";
  entityId?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  targetUserName?: string;
  targetRole?: UserRole;
  source?: string;
}

export interface SimulationProduct {
  id: string;
  code: string;
  product: string;
  boxes: number;
  unitsPerBox: number;
  quantityTotal: number;
  costUnit: number;
  costTotal?: number;
  invoicePrice?: number;
  saleUnit: number;
  saleTotal?: number;
}

export interface PurchaseItem {
  id: string;
  type: "Mercadoria" | "Impostos" | "Seguro" | "Complemento" | "Outros";
  document: string;
  supplier: string;
  value: number;
  allocationPercent: number;
}

export interface ExpenseItem {
  id: string;
  type:
    | "Frete"
    | "Comissão"
    | "Custo NF"
    | "Custo fiscal"
    | "Financeiro"
    | "PIS E COFINS"
    | "STRINT"
    | "Tributos"
    | "Pallets"
    | "Chapa/Descarga"
    | "Seguro"
    | "Outros";
  calculationType: "fixed" | "percentage";
  calculationBase?: "revenue" | "purchaseTotal" | "grossProfit";
  value: number;
}

export interface FinancialData {
  installmentDays: number[];
  bank: string;
  paymentMethod: string;
  account: string;
  discountPercent: number;
  notes: string;
}

export type ApprovalStage = "financial" | "principal";
export type ApprovalStageStatus = "pending" | "approved" | "adjustment_requested" | "rejected";

export interface ApprovalStepState {
  status: ApprovalStageStatus;
  approverId?: string;
  approverName?: string;
  decidedAt?: string;
  notes?: string;
  bankAccount?: string;
}

export interface SimulationApprovalFlow {
  financial: ApprovalStepState;
  principal: ApprovalStepState;
}

export interface Simulation {
  id: string;
  number: string;
  client: string;
  supplier: string;
  deliveryCity: string;
  deliveryState: string;
  owner: string;
  unit: string;
  paymentCondition: string;
  deliveryDate: string;
  createdAt: string;
  validUntil: string;
  notes: string;
  financialNotes?: string;
  status: Exclude<
    AppStatus,
    | "Em faturamento"
    | "Aguardando frete"
    | "Aguardando carregamento"
    | "Em carregamento"
    | "Em separação"
    | "Em rota"
    | "No destino"
    | "Mercadoria descarregada"
    | "Entregue"
  >;
  priority: Priority;
  products: SimulationProduct[];
  purchaseItems: PurchaseItem[];
  expenseItems: ExpenseItem[];
  financial: FinancialData;
  approvalChecklist?: {
    assumptionsReviewed: boolean;
    marginValidated: boolean;
    costsChecked: boolean;
    notesRegistered: boolean;
  };
  approvalFlow?: SimulationApprovalFlow;
  approvalNotes?: string;
  adjustmentReason?: string;
  adjustmentRequestedAt?: string;
  adjustmentRequestedBy?: string;
  adjustmentStage?: ApprovalStage;
  paymentRequestedAt?: string;
  paymentPaidAt?: string;
  paymentPaidBy?: string;
  paymentReceiptFileName?: string;
  paymentReceiptFilePath?: string;
  paymentReceiptAttachedAt?: string;
  paymentReceiptAttachedBy?: string;
  paymentValidationNotes?: string;
  paymentValidatedAt?: string;
  paymentValidatedBy?: string;
  paymentAdjustmentReason?: string;
  orderId?: string;
  convertedAt?: string;
}

export interface OrderTimelineEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  completed: boolean;
}

export interface Order {
  id: string;
  number: string;
  simulationId?: string;
  client: string;
  origin: string;
  destination: string;
  owner: string;
  unit: string;
  date: string;
  expectedDelivery: string;
  totalValue: number;
  status: Extract<
    AppStatus,
    | "Aguardando faturamento"
    | "Em faturamento"
    | "Pedido confirmado"
    | "Aguardando frete"
    | "Frete liberado"
    | "Aguardando carregamento"
    | "Em carregamento"
    | "Em separação"
    | "Em rota"
    | "No destino"
    | "Mercadoria descarregada"
    | "Entregue"
  >;
  priority: Priority;
  products: SimulationProduct[];
  billingProgress: number;
  invoiceNumber?: string;
  invoiceAmount?: number;
  invoiceIssuedAt?: string;
  billingDueDate?: string;
  billingNotes?: string;
  billedAt?: string;
  billedBy?: string;
  deliveryProgress: number;
  paymentTerms: string;
  logisticsStatus: string;
  documents: string[];
  notes: string[];
  timeline: OrderTimelineEvent[];
}

export type FinancialTitleType = "receivable" | "payable";
export type FinancialTitleStatus = "open" | "partial" | "paid" | "overdue" | "cancelled";

export interface FinancialTitle {
  id: string;
  orderId?: string;
  orderNumber?: string;
  simulationId?: string;
  simulationNumber?: string;
  client: string;
  titleNumber: string;
  type: FinancialTitleType;
  status: FinancialTitleStatus;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paymentMethod: string;
  bankName: string;
  invoiceNumber?: string;
  invoiceIssuedAt?: string;
  proofFileName?: string;
  proofFilePath?: string;
  proofAttachedAt?: string;
  proofAttachedBy?: string;
  notes: string;
  owner: string;
  unit: string;
  createdAt: string;
  paidAt?: string;
}

export type RealizedResultStatus = "draft" | "in_progress" | "closed" | "cancelled";
export type CommissionApprovalStatus = "pending" | "approved" | "rejected";

export interface RealizedResultRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  client: string;
  owner: string;
  unit: string;
  status: RealizedResultStatus;
  orderTotal: number;
  realizedRevenueTotal: number;
  receivableOpenTotal: number;
  costBookedTotal: number;
  costPaidTotal: number;
  commissionPercent: number;
  commissionTotal: number;
  realizedProfit: number;
  projectedNetResult: number;
  predictedMarginPercent: number;
  realizedMarginPercent: number;
  marginDeltaPercent: number;
  billingProgress: number;
  paymentProgress: number;
  deliveryCompleted: boolean;
  financialCompleted: boolean;
  commissionApprovalStatus: CommissionApprovalStatus;
  commissionApprovedBy?: string;
  commissionApprovedAt?: string;
  commissionNotes: string;
  closedAt?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type FreightStatus =
  | "quoted"
  | "hired"
  | "loading"
  | "in_route"
  | "at_destination"
  | "unloaded"
  | "delivered"
  | "cancelled";

export type FreightCargoType = "comum" | "perigosa" | "refrigerada" | "excesso" | "rastreada";
export type FreightDriverEmploymentType = "autonomo" | "transportadora";

export interface FreightRecord {
  id: string;
  code: string;
  orderId?: string;
  orderNumber?: string;
  client: string;
  carrierName: string;
  carrierDocument?: string;
  driverName: string;
  driverCpf?: string;
  driverPhone?: string;
  driverEmploymentType?: FreightDriverEmploymentType;
  vehicleDescription: string;
  vehiclePlate: string;
  trailerPlate?: string;
  anttRegistration?: string;
  route: string;
  plannedFreightValue?: number;
  freightValue: number;
  weight: string;
  status: FreightStatus;
  cargoType?: FreightCargoType;
  pickupDate: string;
  expectedDeliveryDate: string;
  freightPaymentDueDate?: string;
  freightPaymentTitleId?: string;
  owner: string;
  unit: string;
  notes: string;
  createdAt: string;
  deliveredAt?: string;
}

export type DeliveryStatus =
  "pending" | "loading" | "loaded" | "in_route" | "arrived" | "delivered" | "issue" | "cancelled";

export interface DeliveryOccurrence {
  id: string;
  type: string;
  description: string;
  location?: string;
  createdAt: string;
  createdBy: string;
}

export interface DeliveryRecord {
  id: string;
  orderId?: string;
  orderNumber?: string;
  freightId?: string;
  freightCode?: string;
  client: string;
  route: string;
  status: DeliveryStatus;
  currentLocation: string;
  expectedDeliveryDate: string;
  deliveredAt?: string;
  proofNotes: string;
  proofDocumentNumber?: string;
  proofFileName?: string;
  proofFilePath?: string;
  proofFileSize?: number;
  proofMimeType?: string;
  proofReceivedBy?: string;
  proofRegisteredAt?: string;
  occurrenceNotes: string;
  occurrences: DeliveryOccurrence[];
  owner: string;
  unit: string;
  createdAt: string;
}

export type {
  NegotiationWallet,
  NegotiationWalletEntry,
  OpportunityPool,
  OpportunityPoolEntry,
} from "@/features/negotiation-wallets";

export interface Negotiation {
  id: string;
  number: string;
  client: string;
  owner: string;
  stage: "Oportunidade" | "Simulação" | "Aprovação" | "Pedido" | "Concluída" | "Cancelada";
  expectedValue: number;
  marginPercent: number;
  nextAction: string;
  status: "Aberta" | "Aguardando definição" | "Aprovada" | "Convertida" | "Cancelada";
}
