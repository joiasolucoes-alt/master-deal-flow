import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppContext } from "@/features/app/app-context";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/pool-oportunidades")({
  component: OpportunityPoolPage,
});

function OpportunityPoolPage() {
  const { opportunityPools, negotiationWallets } = useAppContext();
  const pools = opportunityPools.length
    ? opportunityPools
    : [createVirtualPool(negotiationWallets)];
  const pool = pools[0];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pool de Oportunidades"
        description="Resultado acumulado de carteiras encerradas e transferidas."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Saldo acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(pool.balance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Entradas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">
              {formatCurrency(
                pool.entries
                  .filter((e) => e.direction === "credit")
                  .reduce((s, e) => s + e.amount, 0),
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saídas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {formatCurrency(
                pool.entries
                  .filter((e) => e.direction === "debit")
                  .reduce((s, e) => s + e.amount, 0),
              )}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Histórico de movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Negociação</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pool.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{entry.walletId ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {entry.direction === "credit" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell className="text-right">{formatCurrency(entry.amount)}</TableCell>
                </TableRow>
              ))}
              {pool.entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhuma transferência registrada.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function createVirtualPool(wallets: ReturnType<typeof useAppContext>["negotiationWallets"]) {
  const transferred = wallets.filter(
    (wallet) =>
      wallet.status === "transferred" && (wallet.finalBalance ?? wallet.currentBalance) > 0,
  );
  const entries = transferred.map((wallet) => ({
    id: `virtual-${wallet.id}`,
    poolId: "pool-geral",
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    amount: wallet.finalBalance ?? wallet.currentBalance,
    direction: "credit" as const,
    description: `Saldo transferido da carteira do pedido ${wallet.orderId}.`,
    createdAt: wallet.closedAt ?? wallet.updatedAt,
  }));
  return {
    id: "pool-geral",
    organizationId: "local",
    name: "Resultado Acumulado",
    balance: entries.reduce((sum, entry) => sum + entry.amount, 0),
    status: "active" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries,
  };
}
