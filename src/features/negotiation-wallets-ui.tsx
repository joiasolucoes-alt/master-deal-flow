import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NegotiationWallet } from "@/data/types";
import { getNegotiationWalletBalance } from "@/features/negotiation-wallets";
import { formatCurrency, formatDateTime } from "@/lib/format";

export function NegotiationWalletCard({ wallet }: { wallet?: NegotiationWallet | null }) {
  const balance = getNegotiationWalletBalance(wallet);
  const entries = wallet?.entries ?? [];

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Carteira da Negociação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border bg-muted/35 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Saldo atual
          </p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${balance >= 0 ? "text-success" : "text-danger"}`}
          >
            {formatCurrency(balance)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Saldo calculado automaticamente pelo extrato.
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            A carteira já está vinculada ao pedido. Salve um frete contratado diferente do previsto
            na simulação para gerar o primeiro lançamento.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {entries.map((entry) => {
              const muted = Boolean(entry.reversedEntryId);
              const isCredit = entry.direction === "credit";

              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 p-3 ${muted ? "bg-muted/30 opacity-65" : "bg-card"}`}
                >
                  {isCredit ? (
                    <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <ArrowDownCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{entry.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(entry.occurredAt)} • {entry.category}
                      {muted ? " • estornado" : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${isCredit ? "text-success" : "text-danger"}`}
                  >
                    {isCredit ? "+" : "-"}
                    {formatCurrency(entry.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
