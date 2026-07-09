import { useId } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Sparkline inline em SVG (sem dependência de biblioteca de gráfico).
 * A cor codifica a direção da tendência: verde (alta) ou vermelho (queda),
 * usando os tokens semânticos — mesma linguagem de cor dos badges e gráficos.
 */
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const gradientId = useId();
  if (data.length < 2) return null;

  const width = 120;
  const height = 32;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = pad + (index / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  const stroke = positive ? "var(--color-success)" : "var(--color-danger)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="mt-1 h-8 w-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone = "success",
  trend,
  trendPositive,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  tone?: "success" | "warning" | "danger" | "info";
  /** Série numérica opcional para renderizar um sparkline sob o valor. */
  trend?: number[];
  /** Direção da série (controla a cor do sparkline). Default: infere do delta. */
  trendPositive?: boolean;
}) {
  const toneMap = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  } satisfies Record<string, string>;
  const positive = !delta?.trim().startsWith("-");
  const sparkPositive = trendPositive ?? positive;

  return (
    <Card className="hover-lift animate-page border-border/90">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p
              data-metric
              className="truncate text-3xl font-bold tracking-[-0.035em] text-foreground"
            >
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
              "grid h-10 w-10 shrink-0 place-items-center rounded-md ring-1 ring-current/10",
              toneMap[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && trend.length > 1 ? <Sparkline data={trend} positive={sparkPositive} /> : null}
      </CardContent>
    </Card>
  );
}
