import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, CircleDollarSign, HandCoins, TriangleAlert, WalletCards } from "lucide-react";
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
import {
  getWalletLossCoverage,
  getWalletManagementState,
  roundCurrency,
} from "@/features/negotiation-wallets";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pool-oportunidades")({
  component: OpportunityPoolPage,
});

function OpportunityPoolPage() {
  const { auth, opportunityPools, negotiationWallets, orders, coverNegotiationWalletLossWithPool } =
    useAppContext();
  const [coverageWalletId, setCoverageWalletId] = useState<string | null>(null);
  const [coverageAmount, setCoverageAmount] = useState("");
  const [coverageReason, setCoverageReason] = useState("");
  const [submittingCoverage, setSubmittingCoverage] = useState(false);
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
  const coverageWallet = negotiationWallets.find((wallet) => wallet.id === coverageWalletId);
  const coverageState = coverageWallet ? getWalletLossCoverage(coverageWallet) : null;
  const eligibleLosses = closedWallets.filter((wallet) => getWalletLossCoverage(wallet).canUsePool);

  const openCoverageDialog = (walletId: string) => {
    const wallet = negotiationWallets.find((item) => item.id === walletId);
    if (!wallet) return;
    const state = getWalletLossCoverage(wallet);
    setCoverageWalletId(walletId);
    setCoverageAmount(String(Math.min(state.remainingAmount, pool.balance)).replace(".", ","));
    setCoverageReason("");
  };

  const submitCoverage = async () => {
    if (!coverageWallet || !coverageState || submittingCoverage) return;
    const amount = parseCurrency(coverageAmount);
    setSubmittingCoverage(true);
    const result = await coverNegotiationWalletLossWithPool(
      coverageWallet,
      pool,
      amount,
      coverageReason,
    );
    setSubmittingCoverage(false);
    if (!result.ok) {
      toast.error(result.message ?? "Não foi possível compensar o prejuízo.");
      return;
    }
    toast.success("Compensação registrada no Pool de Oportunidades.");
    setCoverageWalletId(null);
  };
  return (
    <div className="space-y-6">
      <Dialog
        open={Boolean(coverageWallet)}
        onOpenChange={(open) => !open && setCoverageWalletId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrir prejuízo com o Pool</DialogTitle>
            <DialogDescription>
              O resultado realizado continuará registrado. Esta ação informa como a Master cobriu o
              prejuízo usando o saldo acumulado.
            </DialogDescription>
          </DialogHeader>
          {coverageWallet && coverageState ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <PoolMetric label="Saldo do Pool" value={formatCurrency(pool.balance)} />
                <PoolMetric
                  label="Prejuízo restante"
                  value={formatCurrency(coverageState.remainingAmount)}
                />
                <PoolMetric
                  label="Já coberto"
                  value={formatCurrency(coverageState.coveredAmount)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coverage-amount">Valor da compensação</Label>
                <Input
                  id="coverage-amount"
                  inputMode="decimal"
                  value={coverageAmount}
                  onChange={(event) => setCoverageAmount(event.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coverage-reason">Motivo da compensação</Label>
                <Textarea
                  id="coverage-reason"
                  value={coverageReason}
                  onChange={(event) => setCoverageReason(event.target.value)}
                  placeholder="Explique por que o saldo do Pool será utilizado."
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoverageWalletId(null)}>
              Cancelar
            </Button>
            <Button
              onClick={submitCoverage}
              disabled={
                submittingCoverage || !coverageReason.trim() || parseCurrency(coverageAmount) <= 0
              }
            >
              <HandCoins />
              {submittingCoverage ? "Registrando..." : "Confirmar compensação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            <p className="text-sm text-muted-foreground">
              {pendingLosses.length} com prejuízo • {eligibleLosses.length} para compensar
            </p>
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
                <TableHead>Cobertura do Pool</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {closedWallets.map((wallet) => {
                const state = getWalletManagementState(wallet);
                const order = orders.find((item) => item.id === wallet.orderId);
                const coverage = getWalletLossCoverage(wallet);
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
                    <TableCell>
                      {coverage.lossAmount > 0 ? (
                        <div className="space-y-1 text-sm">
                          <p>{formatCurrency(coverage.coveredAmount)} coberto</p>
                          <p className="text-muted-foreground">
                            {formatCurrency(coverage.remainingAmount)} restante
                          </p>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{wallet.managementDecidedBy ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canManage && coverage.canUsePool ? (
                          <Button
                            size="sm"
                            onClick={() => openCoverageDialog(wallet.id)}
                            disabled={pool.balance <= 0}
                          >
                            <HandCoins /> Cobrir com Pool
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="outline">
                          <Link to="/pedidos/$id" params={{ id: wallet.orderId }}>
                            Abrir carteira <ArrowRight />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {closedWallets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
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

function PoolMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function parseCurrency(value: string) {
  return roundCurrency(Number(value.replace(/\./g, "").replace(",", ".")) || 0);
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
