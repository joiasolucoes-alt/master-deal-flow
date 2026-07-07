import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  Rascunho: "border-transparent bg-muted text-muted-foreground",
  "Em análise": "border-transparent bg-info-soft text-info",
  "Pendente de aprovação": "border-transparent bg-info-soft text-info",
  "Aguardando financeiro": "border-transparent bg-info-soft text-info",
  "Aguardando aprovação do Gestor": "border-transparent bg-warning-soft text-warning",
  Aprovada: "border-transparent bg-success-soft text-success",
  Reprovada: "border-transparent bg-danger-soft text-danger",
  "Ajuste solicitado": "border-transparent bg-warning-soft text-warning",
  "Aguardando reajuste": "border-transparent bg-warning-soft text-warning",
  "Aguardando faturamento": "border-transparent bg-warning-soft text-warning",
  "Em faturamento": "border-transparent bg-info-soft text-info",
  "Aguardando frete": "border-transparent bg-warning-soft text-warning",
  "Em separação": "border-transparent bg-warning-soft text-warning",
  "Em rota": "border-transparent bg-primary-soft text-primary",
  Entregue: "border-transparent bg-success-soft text-success",
  Aberta: "border-transparent bg-primary-soft text-primary",
  Convertida: "border-transparent bg-success-soft text-success",
  Cancelada: "border-transparent bg-danger-soft text-danger",
  "Aguardando definição": "border-transparent bg-warning-soft text-warning",
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

export function StatusBadge({ status }: { status: string }) {
  const label =
    status === "Em separação"
      ? "Aguardando frete"
      : status === "Ajuste solicitado"
        ? "Aguardando reajuste"
        : status;
  return (
    <Badge
      className={cn("rounded-full px-3 py-1 font-medium", statusTone[label] ?? statusTone.Rascunho)}
    >
      {label}
    </Badge>
  );
}
