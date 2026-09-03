import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/data/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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
 * catálogo tiver) entram sozinhos. Digitar algo fora do catálogo continua
 * funcionando: o texto fica como está, sem forçar escolha nenhuma.
 *
 * O campo visível é um Input comum, igual às outras células da tabela, e
 * NÃO usa o `Command` do cmdk: com ele, abrir a lista tirava o foco do
 * campo e obrigava o usuário a clicar de novo para seguir digitando. Aqui
 * o foco nunca sai do input — a lista é só um painel ancorado, e cada
 * item cancela o mousedown para não roubar o foco no clique.
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
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

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

  // A lista muda a cada tecla; sem isso o destaque poderia apontar para um
  // índice que não existe mais.
  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  // Com a lista cheia (até 30 itens), navegar de seta passava do que está
  // visível — o destaque sumia para fora do painel.
  useEffect(() => {
    const item = listRef.current?.children[activeIndex];
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const isOpen = open && results.length > 0;

  function choose(product: Product) {
    onSelect(product);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      const product = results[activeIndex];
      if (product) {
        event.preventDefault();
        choose(product);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Nome do produto"}
          className={className}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
        />
      </PopoverAnchor>
      <PopoverContent
        // Os nomes vindos do Winthor são longos ("LEITE COND PIRACANJUBA
        // 27X395G TP"): o painel acompanha a largura do campo, mas pode
        // crescer até 26rem para o nome não ficar cortado.
        className="w-[max(var(--radix-popover-trigger-width),20rem)] max-w-[26rem] p-1"
        align="start"
        // O foco tem que continuar no input: sem isso o Radix move o foco
        // para o painel assim que ele abre, e quem está digitando perde a
        // linha no meio da palavra.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div ref={listRef} className="max-h-64 overflow-y-auto" role="listbox">
          {results.map((product, index) => (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={product.code === code}
              // Cancelar o mousedown evita que o clique tire o foco do
              // input antes do onClick rodar.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(product)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{product.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{product.code}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
