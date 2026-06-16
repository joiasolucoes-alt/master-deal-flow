import { AlertTriangle, CheckCircle2, CircleDashed, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Viability } from "@/data/types";

const viabilityStyles: Record<Viability, { className: string; icon: typeof CheckCircle2 }> = {
  Viável: { className: "bg-success-soft text-success ring-success/20", icon: CheckCircle2 },
  Atenção: { className: "bg-warning-soft text-warning ring-warning/20", icon: AlertTriangle },
  Inviável: { className: "bg-danger-soft text-danger ring-danger/20", icon: OctagonAlert },
  Pendente: { className: "bg-muted text-muted-foreground ring-border", icon: CircleDashed },
};

export function ViabilityBadge({ viability, compact = false }: { viability: Viability; compact?: boolean }) {
  const config = viabilityStyles[viability];
  const Icon = config.icon;
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1", config.className, compact && "px-2.5 py-1 text-xs")}> 
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span>{viability}</span>
    </div>
  );
}
