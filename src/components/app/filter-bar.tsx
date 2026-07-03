import type { ReactNode } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function FilterBar({
  children,
  onClear,
  rightSlot,
}: {
  children: ReactNode;
  onClear?: () => void;
  rightSlot?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Filter className="h-4 w-4 text-primary" />
          <span>Filtros</span>
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">{children}</div>
          <div className="flex flex-wrap items-center gap-2">
            {rightSlot}
            {onClear ? (
              <Button variant="outline" onClick={onClear}>
                <RotateCcw />
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
