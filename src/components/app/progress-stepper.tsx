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
    <ol className="flex max-w-full gap-2 overflow-x-auto pb-2 xl:grid xl:grid-cols-6 xl:overflow-visible xl:pb-0">
      {steps.map((step, index) => {
        const active = index === activeStep;
        const complete = index < activeStep;
        return (
          <li key={step} className="min-w-[152px] xl:min-w-0">
            <button
              type="button"
              onClick={() => onStepChange?.(index)}
              className={cn(
                "grid w-full grid-cols-[auto_1fr] items-center gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-card hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold",
                  active || complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    active ? "text-primary" : "text-foreground",
                  )}
                >
                  {step}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
