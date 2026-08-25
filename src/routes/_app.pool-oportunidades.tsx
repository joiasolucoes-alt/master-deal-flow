import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, CircleDollarSign, TriangleAlert, WalletCards } from "lucide-react";
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
import { canManageOpportunityPool } from "@/lib/permissions";
import { getWalletManagementState } from "@/features/negotiation-wallets";

export const Route = createFileRoute("/_app/pool-oportunidades")({
  component: OpportunityPoolPage,
});

function OpportunityPoolPage() {
  const { auth, opportunityPools, negotiationWallets, orders } = useAppContext();
  const canManage = canManageOpportunityPool(auth.user);
  const pools = opportunityPools.length
    ? opportunityPools
    : [createVirtualPool(negotiationWallets)];
  const pool = pools[0];
  const closedWallets = negotiationWallets.filter(
    (wallet) => wallet.status === "closed" || wallet.status === "transferred",
  );
  const pendingWallets = closedWallets.filter(
    (wallet) => wallet.status === "closed" && !getWalletManagementState(wallet).isDecided,
  );
  const pendingLosses = pendingWallets.filter(
    (wallet) => getWalletManagementState(wallet).outcome === "negative",
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pool de Oportunidades"
        description="Resultado acumulado de carteiras encerradas e transferidas."
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{canManage ? "Gestão do Admin" : "Somente consulta"}</Badge>
        <span>
          {canManage
            ? "Você pode administrar os créditos acumulados."
            : "Somente o Admin pode movimentar os créditos."}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="size-5" /> Decisões pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingWallets.length}</p>
            <p className="text-sm text-muted-foreground">{pendingLosses.length} com prejuízo</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Carteiras encerradas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Confira o saldo final e registre a decisão gerencial antes da transferência.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="text-right">Saldo final</TableHead>
                <TableHead>Decisão</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {closedWallets.map((wallet) => {
                const state = getWalletManagementState(wallet);
                const order = orders.find((item) => item.id === wallet.orderId);
                return (
                  <TableRow key={wallet.id}>
                    <TableCell className="font-medium">{order?.number ?? wallet.orderId}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {state.outcome === "negative" ? (
                          <TriangleAlert className="size-3" />
                        ) : (
                          <WalletCards className="size-3" />
                        )}
                        {state.outcome === "positive"
                          ? "Saldo positivo"
                          : state.outcome === "negative"
                            ? "Prejuízo"
                            : "Saldo zero"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${state.finalBalance < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {formatCurrency(state.finalBalance)}
                    </TableCell>
                    <TableCell>{getDecisionLabel(wallet)}</TableCell>
                    <TableCell>{wallet.managementDecidedBy ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/pedidos/$id" params={{ id: wallet.orderId }}>
                          Abrir carteira <ArrowRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {closedWallets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhuma carteira encerrada para decisão.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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

function getDecisionLabel(wallet: ReturnType<typeof useAppContext>["negotiationWallets"][number]) {
  if (wallet.status === "transferred") return "Transferido ao Pool";
  return {
    pending: "Aguardando decisão",
    approved_for_pool: "Aprovado para o Pool",
    retained: "Mantido na carteira",
    loss_acknowledged: `Prejuízo: ${wallet.lossOwner ?? "responsável não informado"}`,
    zero_acknowledged: "Saldo zero reconhecido",
  }[wallet.managementDecision ?? "pending"];
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
