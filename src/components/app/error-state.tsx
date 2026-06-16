import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-danger/20 bg-danger-soft px-6 py-10 text-center">
      <div className="space-y-4">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger text-white">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {onRetry ? <Button onClick={onRetry}>Tentar novamente</Button> : null}
      </div>
    </div>
  );
}
