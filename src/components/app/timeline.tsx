import { cn } from "@/lib/utils";
import type { OrderTimelineEvent } from "@/data/types";
import { formatDateTime } from "@/lib/format";

export function Timeline({ items }: { items: OrderTimelineEvent[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li key={item.id} className="grid grid-cols-[auto_1fr] gap-3">
          <div className="relative flex flex-col items-center">
            <span
              className={cn(
                "mt-1 h-3.5 w-3.5 rounded-full border-2",
                item.completed ? "border-primary bg-primary" : "border-muted-foreground/40 bg-background",
              )}
            />
            {index < items.length - 1 ? <span className="mt-1 h-full w-px bg-border" /> : null}
          </div>
          <div className="space-y-1 pb-4">
            <p className="font-medium text-foreground">{item.title}</p>
            <p className="text-sm text-muted-foreground">{item.description}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(item.date)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
