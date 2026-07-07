import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useAppContext } from "@/features/app/app-context";
import { formatCurrency, formatPercent } from "@/lib/format";
import { belongsToUser, canViewAllFlows } from "@/lib/visibility";

export const Route = createFileRoute("/_app/negociacoes/$id")({
  component: NegotiationDetailPage,
});

function NegotiationDetailPage() {
  const { id } = useParams({ from: "/_app/negociacoes/$id" });
  const { auth, negotiations } = useAppContext();
  const negotiation = negotiations.find((item) => item.id === id);
  const canViewNegotiation =
    negotiation && (canViewAllFlows(auth.user) || belongsToUser(negotiation.owner, auth.user));

  if (!negotiation || !canViewNegotiation) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link to="/negociacoes">
            <ArrowLeft /> Voltar para negociações
          </Link>
        </Button>
        <Card className="shadow-card">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Negociação não encontrada.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/negociacoes">
          <ArrowLeft /> Voltar para negociações
        </Link>
      </Button>

      <PageHeader
        title={negotiation.number}
        description={`${negotiation.client} • Responsável: ${negotiation.owner}`}
        action={
          <Button asChild>
            <Link to="/simulacoes">
              <FileSpreadsheet /> Ver simulações
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={negotiation.status} />
        <Badge variant="outline" className="rounded-full">
          Etapa: {negotiation.stage}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Resumo da negociação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Info label="Cliente" value={negotiation.client} />
            <Info label="Responsável" value={negotiation.owner} />
            <Info label="Valor previsto" value={formatCurrency(negotiation.expectedValue)} />
            <Info label="Margem prevista" value={formatPercent(negotiation.marginPercent)} />
            <Info label="Etapa" value={negotiation.stage} />
            <Info label="Status" value={negotiation.status} />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Próxima ação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{negotiation.nextAction}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}
