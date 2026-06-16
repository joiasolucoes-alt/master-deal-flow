import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center shadow-card">
      <div className="space-y-3">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
