import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  Rascunho: "border-transparent bg-muted text-muted-foreground",
  "Em análise": "border-transparent bg-info-soft text-info",
  "Pendente de aprovação": "border-transparent bg-info-soft text-info",
  "Aguardando financeiro": "border-transparent bg-info-soft text-info",
  "Aguardando aprovação do Gestor": "border-transparent bg-warning-soft text-warning",
  "Aguardando pagamento": "border-transparent bg-warning-soft text-warning",
  "Pagamento realizado": "border-transparent bg-info-soft text-info",
  "Comprovante anexado": "border-transparent bg-info-soft text-info",
  "Aguardando validação comercial": "border-transparent bg-warning-soft text-warning",
  "Validada pelo comercial": "border-transparent bg-success-soft text-success",
  Aprovada: "border-transparent bg-success-soft text-success",
  Reprovada: "border-transparent bg-danger-soft text-danger",
  "Ajuste solicitado": "border-transparent bg-warning-soft text-warning",
  "Aguardando reajuste": "border-transparent bg-warning-soft text-warning",
  "Aguardando faturamento": "border-transparent bg-warning-soft text-warning",
  "Em faturamento": "border-transparent bg-info-soft text-info",
  "Pedido confirmado": "border-transparent bg-success-soft text-success",
  "Aguardando frete": "border-transparent bg-warning-soft text-warning",
  "Frete liberado": "border-transparent bg-success-soft text-success",
  "Em separação": "border-transparent bg-warning-soft text-warning",
  "Em rota": "border-transparent bg-primary-soft text-primary",
  Entregue: "border-transparent bg-success-soft text-success",
  Aberta: "border-transparent bg-primary-soft text-primary",
  Convertida: "border-transparent bg-success-soft text-success",
  Cancelada: "border-transparent bg-danger-soft text-danger",
  "Aguardando definição": "border-transparent bg-warning-soft text-warning",
  "Aguardando liberação financeira": "border-transparent bg-warning-soft text-warning",
  "Liberado para contratação": "border-transparent bg-success-soft text-success",
  Finalizado: "border-transparent bg-success-soft text-success",
  "A vencer": "border-transparent bg-info-soft text-info",
  Parcial: "border-transparent bg-warning-soft text-warning",
  Pago: "border-transparent bg-success-soft text-success",
  Vencido: "border-transparent bg-danger-soft text-danger",
  Cancelado: "border-transparent bg-danger-soft text-danger",
  Cotação: "border-transparent bg-info-soft text-info",
  "Em contratação": "border-transparent bg-warning-soft text-warning",
  Contratado: "border-transparent bg-success-soft text-success",
  Carregando: "border-transparent bg-warning-soft text-warning",
  Pendente: "border-transparent bg-info-soft text-info",
  Carregado: "border-transparent bg-warning-soft text-warning",
  "No destino": "border-transparent bg-primary-soft text-primary",
  Ocorrência: "border-transparent bg-danger-soft text-danger",
};

/** Resolve o rótulo canônico de um status (aplica os apelidos de exibição). */
function resolveStatusLabel(status: string): string {
  return status === "Em separação"
    ? "Aguardando frete"
    : status === "Ajuste solicitado"
      ? "Aguardando reajuste"
      : status;
}

/**
 * Cor semântica (CSS var) de um status, derivada do MESMO mapa `statusTone`
 * usado no badge. Garante que a fatia do gráfico e o badge da listagem
 * tenham exatamente a mesma cor para o mesmo status.
 */
const toneToColor: Record<string, string> = {
  "text-success": "var(--color-success)",
  "text-danger": "var(--color-danger)",
  "text-warning": "var(--color-warning)",
  "text-info": "var(--color-info)",
  "text-primary": "var(--color-primary)",
  "text-muted-foreground": "var(--color-muted-foreground)",
};

export function getStatusColor(status: string): string {
  const classes = statusTone[resolveStatusLabel(status)] ?? statusTone.Rascunho;
  const toneKey = Object.keys(toneToColor).find((key) => classes.includes(key));
  return toneKey ? toneToColor[toneKey] : "var(--color-muted-foreground)";
}

export type StatusTone = "primary" | "success" | "warning" | "danger" | "info";

const toneToName: Record<string, StatusTone> = {
  "text-success": "success",
  "text-danger": "danger",
  "text-warning": "warning",
  "text-info": "info",
  "text-primary": "primary",
};

/** Tom semântico de um status, no formato aceito por componentes como `Progress`. */
export function getStatusTone(status: string): StatusTone {
  const classes = statusTone[resolveStatusLabel(status)] ?? statusTone.Rascunho;
  const toneKey = Object.keys(toneToName).find((key) => classes.includes(key));
  return toneKey ? toneToName[toneKey] : "primary";
}

export function StatusBadge({ status }: { status: string }) {
  const label = resolveStatusLabel(status);
  return (
    <Badge
      className={cn("rounded-full px-3 py-1 font-medium", statusTone[label] ?? statusTone.Rascunho)}
    >
      {label}
    </Badge>
  );
}
