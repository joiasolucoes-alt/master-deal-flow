import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, digits = 1) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}%`;
}

export function formatDate(value: string) {
  return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTime(value: string) {
  return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}
