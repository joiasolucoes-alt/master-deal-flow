import { Check, Monitor, MoonStar, SunMedium } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/features/app/app-context";
import type { ThemeMode } from "@/data/types";

const themeOptions: { value: ThemeMode; label: string; icon: typeof SunMedium }[] = [
  { value: "light", label: "Claro", icon: SunMedium },
  { value: "dark", label: "Escuro", icon: MoonStar },
  { value: "system", label: "Sistema", icon: Monitor },
];

export function ThemeToggle() {
  const { themeMode, setThemeMode } = useAppContext();
  const active = themeOptions.find((item) => item.value === themeMode) ?? themeOptions[0];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Alternar tema"
          className="h-10 w-10 rounded-full"
        >
          <ActiveIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem key={option.value} onClick={() => setThemeMode(option.value)}>
              <Icon />
              <span>{option.label}</span>
              {themeMode === option.value && <Check className="ml-auto" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
