import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, MapPin, PackageCheck, Truck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { orders } from "@/data/orders";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/entregas")({
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const inTransit = orders.filter((o) => o.status === "Em rota");
  const delivered = orders.filter((o) => o.status === "Entregue");
  const upcoming = orders.filter((o) => o.status !== "Entregue");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entregas"
        description="Monitore as entregas em andamento, atrasos e comprovações."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Em trânsito" value={String(inTransit.length)} icon={Truck} tone="info" />
        <StatCard
          label="Entregues"
          value={String(delivered.length)}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Pendentes"
          value={String(upcoming.length)}
          icon={PackageCheck}
          tone="warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {upcoming.map((order) => (
          <Card key={order.id} className="shadow-card">
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">{order.number}</CardTitle>
                <p className="text-sm text-muted-foreground">{order.client}</p>
              </div>
              <StatusBadge status={order.status} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-medium">{order.origin}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium">{order.destination}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Entrega</span>
                  <span>{order.deliveryProgress}%</span>
                </div>
                <Progress value={order.deliveryProgress} className="h-2" />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Previsão</p>
                  <p className="font-medium">{formatDateTime(order.expectedDelivery)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-medium">{formatCurrency(order.totalValue)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{order.logisticsStatus}</p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/pedidos/$id" params={{ id: order.id }}>
                  Ver pedido
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
