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
    <header className={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-foreground md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
