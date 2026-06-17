import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", className)}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}
