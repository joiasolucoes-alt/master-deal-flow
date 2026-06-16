import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({ name, initials, className }: { name: string; initials: string; className?: string }) {
  return (
    <Avatar className={cn("h-10 w-10 ring-1 ring-border", className)}>
      <AvatarFallback className="bg-primary text-primary-foreground font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}
