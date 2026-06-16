import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="space-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><CalendarRange className="h-4 w-4" />De</span>
        <Input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} />
      </label>
      <label className="space-y-1 text-sm text-muted-foreground">
        <span>Até</span>
        <Input type="date" value={to} onChange={(event) => onToChange(event.target.value)} />
      </label>
    </div>
  );
}
