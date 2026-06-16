import { cn } from "@/lib/utils";

export function ProgressStepper({
  steps,
  activeStep,
  onStepChange,
}: {
  steps: string[];
  activeStep: number;
  onStepChange?: (index: number) => void;
}) {
  return (
    <ol className="grid gap-3 xl:grid-cols-6">
      {steps.map((step, index) => {
        const active = index === activeStep;
        const complete = index < activeStep;
        return (
          <li key={step} className="min-w-0">
            <button
              type="button"
              onClick={() => onStepChange?.(index)}
              className={cn(
                "grid w-full grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                active ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted/40",
              )}
            >
              <span className={cn("grid h-9 w-9 place-items-center rounded-full border text-sm font-semibold", active || complete ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{index + 1}</span>
              <span className="min-w-0">
                <span className={cn("block truncate text-sm font-medium", active ? "text-primary" : "text-foreground")}>{step}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
