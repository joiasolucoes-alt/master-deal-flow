import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { Product } from "@/data/types";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

const MAX_RESULTS = 30;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface ProductComboboxProps {
  value: string;
  code: string;
  products: Product[];
  onValueChange: (value: string) => void;
  onSelect: (product: Product) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Busca de produto no catálogo com preenchimento automático — o usuário
 * digita o nome, escolhe uma opção e código/unidade/preço (quando o
 * catálogo tiver) entram sozinhos. Digitar algo que não existe no
 * catálogo continua funcionando: o texto fica como está, sem forçar
 * escolha nenhuma — é assim que um produto sem cadastro é preenchido
 * manualmente.
 */
export function ProductCombobox({
  value,
  code,
  products,
  onValueChange,
  onSelect,
  placeholder,
  className,
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const query = normalize(value.trim());
    if (!query) return [];
    return products
      .filter((product) => product.active !== false)
      .filter(
        (product) =>
          normalize(product.name).includes(query) || normalize(product.code).includes(query),
      )
      .slice(0, MAX_RESULTS);
  }, [products, value]);

  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Command shouldFilter={false} className="overflow-visible bg-transparent">
          <CommandInput
            value={value}
            onValueChange={(next) => {
              onValueChange(next);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? "Nome do produto"}
            className={cn("h-9 rounded-md border border-input px-3 py-1 text-sm", className)}
          />
        </Command>
      </PopoverAnchor>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>Nenhum produto encontrado no catálogo.</CommandEmpty>
            <CommandGroup>
              {results.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onSelect={() => {
                    onSelect(product);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      product.code === code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{product.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
