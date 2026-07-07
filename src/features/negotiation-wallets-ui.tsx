import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  NegotiationWallet,
  OpportunityPool,
  WalletEntryCategory,
  WalletEntryDirection,
} from "@/features/negotiation-wallets";
import {
  createWalletEntry,
  getWalletTotals,
  recalculateWallet,
  roundCurrency,
  upsertWalletEntry,
} from "@/features/negotiation-wallets";
import type { User } from "@/data/types";
import { formatCurrency, formatDateTime } from "@/lib/format";

const CATEGORY_LABELS: Record<WalletEntryCategory, string> = {
  freight_saving: "Economia de frete",
  freight_extra_cost: "Custo extra de frete",
  financial_cost_adjustment: "Ajuste financeiro",
  boleto_delay_cost: "Atraso de boleta",
  commission_adjustment: "Ajuste de comissão",
  fiscal_cost_adjustment: "Ajuste fiscal",
  discount_given: "Desconto concedido",
  price_adjustment: "Ajuste de preço",
  unloading_cost: "Descarga",
  chapa_cost: "Chapa",
  operational_extra_cost: "Custo operacional",
  supplier_cost_change: "Custo fornecedor",
  customer_payment_adjustment: "Ajuste recebimento",
  manual_adjustment: "Ajuste manual",
  closing_transfer: "Transferência",
};

export function NegotiationWalletSection({
  wallet,
  user,
  onChange,
}: {
  wallet?: NegotiationWallet;
  user?: User | null;
  onChange: (wallet: NegotiationWallet) => void;
}) {
  if (!wallet) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carteira da Negociação</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Carteira ainda não criada para este pedido.
        </CardContent>
      </Card>
    );
  }
  const totals = getWalletTotals(wallet);
  const canChange =
    ["Admin", "Financeiro", "Negociações"].includes(user?.role ?? "") &&
    wallet.status !== "transferred" &&
    wallet.status !== "cancelled";

  const addManual = () => {
    if (!canChange || wallet.status === "closed") return;
    const rawAmount = window.prompt("Valor do ajuste gerencial da negociação:", "0,00");
    if (rawAmount === null) return;
    const amount = parseCurrency(rawAmount);
    if (amount <= 0) return;
    const direction = window.confirm("Clique OK para CRÉDITO. Clique Cancelar para DÉBITO.")
      ? "credit"
      : "debit";
    const description =
      window.prompt("Descrição do lançamento:", "Ajuste manual autorizado") ??
      "Ajuste manual autorizado";
    onChange(
      upsertWalletEntry(
        wallet,
        createWalletEntry({
          walletId: wallet.id,
          organizationId: wallet.organizationId,
          simulationId: wallet.simulationId,
          orderId: wallet.orderId,
          entryType: "manual",
          category: "manual_adjustment",
          sourceModule: "manual",
          amount,
          direction,
          description,
          createdBy: user?.id ?? user?.email,
        }),
      ),
    );
  };

  const closeWallet = () => {
    if (!canChange || wallet.status === "closed" || wallet.status === "transferred") return;
    const next = recalculateWallet({
      ...wallet,
      status: "closed",
      finalBalance: totals.balance,
      closedAt: new Date().toISOString(),
    });
    onChange(next);
  };

  const transferToPool = () => {
    if (!canChange || wallet.status !== "closed" || (wallet.finalBalance ?? totals.balance) <= 0)
      return;
    onChange(recalculateWallet({ ...wallet, status: "transferred" }));
  };

  const reverseEntry = (entryId: string) => {
    if (!canChange) return;
    const reason =
      window.prompt("Motivo do estorno:", "Correção operacional") ?? "Correção operacional";
    onChange(
      recalculateWallet({
        ...wallet,
        entries: wallet.entries.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                reversedAt: new Date().toISOString(),
                reversedBy: user?.id ?? user?.email,
                reversalReason: reason,
              }
            : entry,
        ),
      }),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Carteira da Negociação</CardTitle>
          <p className="text-sm text-muted-foreground">
            Resultado operacional gerencial calculado por extrato imutável.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={addManual}
            disabled={!canChange || wallet.status === "closed"}
          >
            Adicionar ajuste
          </Button>
          <Button
            onClick={closeWallet}
            disabled={!canChange || wallet.status === "closed" || wallet.status === "transferred"}
          >
            Encerrar carteira
          </Button>
          <Button
            variant="secondary"
            onClick={transferToPool}
            disabled={
              !canChange ||
              wallet.status !== "closed" ||
              (wallet.finalBalance ?? totals.balance) <= 0
            }
          >
            Transferir para pool
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Metric label="Lucro previsto" value={formatCurrency(wallet.initialExpectedProfit)} />
          <Metric
            label="Créditos acumulados"
            value={formatCurrency(totals.credits)}
            tone="text-success"
          />
          <Metric
            label="Débitos acumulados"
            value={formatCurrency(totals.debits)}
            tone="text-destructive"
          />
          <Metric
            label="Saldo atual"
            value={formatCurrency(totals.balance)}
            tone={totals.balance >= 0 ? "text-success" : "text-destructive"}
          />
          <Metric
            label="Resultado final"
            value={wallet.finalBalance == null ? "—" : formatCurrency(wallet.finalBalance)}
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span>Status:</span>
          <Badge variant="outline">{wallet.status}</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {wallet.entries.map((entry) => (
              <TableRow key={entry.id} className={entry.reversedAt ? "opacity-50" : ""}>
                <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                <TableCell>{entry.sourceModule}</TableCell>
                <TableCell>{CATEGORY_LABELS[entry.category]}</TableCell>
                <TableCell>
                  {entry.description}
                  {entry.reversedAt ? " (estornado)" : ""}
                </TableCell>
                <TableCell>
                  <DirectionBadge direction={entry.direction} />
                </TableCell>
                <TableCell
                  className={`text-right font-semibold ${entry.direction === "credit" ? "text-success" : "text-destructive"}`}
                >
                  {formatCurrency(entry.amount)}
                </TableCell>
                <TableCell>{entry.createdBy ?? "Sistema"}</TableCell>
                <TableCell>
                  {!entry.reversedAt && canChange ? (
                    <Button size="sm" variant="ghost" onClick={() => reverseEntry(entry.id)}>
                      Estornar
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {wallet.entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nenhum lançamento adicional.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function OpportunityPoolSection({ pools }: { pools: OpportunityPool[] }) {
  const pool = pools[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pool de Oportunidades</CardTitle>
      </CardHeader>
      <CardContent>
        {pool ? (
          <p className="text-2xl font-semibold">{formatCurrency(pool.balance)}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum pool criado.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
function DirectionBadge({ direction }: { direction: WalletEntryDirection }) {
  return (
    <Badge
      className={
        direction === "credit"
          ? "bg-success text-success-foreground"
          : "bg-destructive text-destructive-foreground"
      }
    >
      {direction === "credit" ? "Crédito" : "Débito"}
    </Badge>
  );
}
function parseCurrency(value: string) {
  return roundCurrency(Number(value.replace(/\./g, "").replace(",", ".")) || 0);
}
