import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ title = "Carregando módulo" }: { title?: string }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-5 w-96 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <p className="mb-4 text-sm text-muted-foreground">{title}</p>
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
