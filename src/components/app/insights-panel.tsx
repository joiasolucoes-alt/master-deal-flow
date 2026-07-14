import { Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";
import type { InsightTone, NegotiationInsights } from "@/features/insights/negotiationInsights";

const alertToneClasses: Record<InsightTone, string> = {
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  info: "border-info/30 bg-info-soft text-info",
};

/**
 * Painel de insights de produto (destaques + recomendações), compartilhado pelas
 * lentes de Negócio e Cliente para manter a mesma linguagem visual e evitar duplicação.
 */
export function InsightsPanel({ insights }: { insights: NegotiationInsights }) {
  if (insights.highlights.length === 0 && insights.alerts.length === 0) {
    return (
      <EmptyState
        title="Sem insights disponíveis"
        description="Vincule simulações e pedidos para gerar destaques de produto e recomendações."
      />
    );
  }

  return (
    <div className="space-y-4">
      {insights.highlights.length > 0 ? (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Destaques de produto
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {insights.highlights.map((highlight) => (
              <div
                key={highlight.key}
                className="rounded-xl border border-border bg-background/60 p-4"
              >
                <p className="text-xs uppercase text-muted-foreground">{highlight.label}</p>
                <p className="mt-1 font-semibold text-foreground">{highlight.product}</p>
                <p className="mt-1 text-lg font-bold text-primary">{highlight.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {insights.alerts.length > 0 ? (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Recomendações para a próxima venda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.alerts.map((alert) => (
              <div key={alert.key} className={cn("rounded-xl border p-4", alertToneClasses[alert.tone])}>
                <p className="font-semibold">{alert.title}</p>
                <p className="mt-1 text-sm opacity-90">{alert.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
