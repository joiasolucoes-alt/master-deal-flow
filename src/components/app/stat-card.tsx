import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone = "success",
}: {
  label: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  const toneMap = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  } satisfies Record<string, string>;
  const positive = !delta?.trim().startsWith("-");

  return (
    <Card className="hover-lift animate-page shadow-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="truncate text-3xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
            {delta ? (
              <p
                className={cn(
                  "inline-flex items-center gap-1 text-sm font-medium",
                  positive ? "text-success" : "text-danger",
                )}
              >
                {positive ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {delta}
              </p>
            ) : null}
          </div>
          <div
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover:scale-110",
              toneMap[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
