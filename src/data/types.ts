export type ThemeMode = "light" | "dark" | "system";
export type UserRole = "Comercial" | "Negociações" | "Aprovador" | "Financeiro" | "Admin";
export type UserStatus = "Pendente" | "Ativo" | "Bloqueado";

export type AppStatus =
  | "Rascunho"
  | "Em análise"
  | "Pendente de aprovação"
  | "Aprovada"
  | "Reprovada"
  | "Ajuste solicitado"
  | "Aguardando faturamento"
  | "Em faturamento"
  | "Em separação"
  | "Em rota"
  | "Entregue";

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
  title: string;
  description: string;
  type: "info" | "warning" | "success";
  createdAt: string;
  unread: boolean;
  href?: string;
  entityType?: "approval" | "delivery" | "simulation" | "order" | "negotiation";
  entityId?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  targetUserName?: string;
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
  status: Exclude<AppStatus, "Em faturamento" | "Em separação" | "Em rota" | "Entregue">;
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
  approvalNotes?: string;
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
    "Aguardando faturamento" | "Em faturamento" | "Em separação" | "Em rota" | "Entregue"
  >;
  priority: Priority;
  products: SimulationProduct[];
  billingProgress: number;
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
  client: string;
  titleNumber: string;
  type: FinancialTitleType;
  status: FinancialTitleStatus;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paymentMethod: string;
  bankName: string;
  notes: string;
  owner: string;
  unit: string;
  createdAt: string;
  paidAt?: string;
}

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
