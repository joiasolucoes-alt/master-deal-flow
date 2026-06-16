import { Input } from "@/components/ui/input";

export function PercentageInput(props: React.ComponentProps<typeof Input>) {
  return <Input inputMode="decimal" placeholder="0,0%" {...props} />;
}
