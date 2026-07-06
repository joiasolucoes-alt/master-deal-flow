import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Download, FileText, Printer } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Timeline } from "@/components/app/timeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppContext } from "@/features/app/app-context";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { filterOrdersForUser } from "@/lib/visibility";

export const Route = createFileRoute("/_app/pedidos/$id")({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { id } = useParams({ from: "/_app/pedidos/$id" });
  const { auth, orders, financialTitles } = useAppContext();
  const order = filterOrdersForUser(orders, auth.user).find((o) => o.id === id);
  if (!order) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/pedidos">
            <ArrowLeft /> Voltar
          </Link>
        </Button>
        <p className="text-muted-foreground">Pedido não encontrado.</p>
      </div>
    );
  }
  const orderReceivables = financialTitles.filter(
    (title) => title.orderId === order.id && title.type === "receivable",
  );
  const billedAmount = orderReceivables
    .filter((title) => title.status !== "cancelled")
    .reduce((sum, title) => sum + title.amount, 0);
  const receivedAmount = orderReceivables.reduce((sum, title) => sum + title.paidAmount, 0);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/pedidos">
          <ArrowLeft /> Voltar para pedidos
        </Link>
      </Button>

      <PageHeader
        title={order.number}
        description={`${order.client} • ${order.origin} → ${order.destination}`}
        action={
          <>
            <Button variant="outline">
              <Printer /> Imprimir
            </Button>
            <Button variant="outline">
              <Download /> Exportar PDF
            </Button>
            <Button>
              <FileText /> Gerar nota fiscal
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={order.status} />
        <Badge variant="outline" className="rounded-full">
          Prioridade: {order.priority}
        </Badge>
        <Badge variant="outline" className="rounded-full">
          Pagamento: {order.paymentTerms}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Resumo do pedido</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Info label="Responsável" value={order.owner} />
              <Info label="Unidade" value={order.unit} />
              <Info label="Valor total" value={formatCurrency(order.totalValue)} highlight />
              <Info label="Data do pedido" value={formatDateTime(order.date)} />
              <Info label="Previsão de entrega" value={formatDateTime(order.expectedDelivery)} />
              <Info label="Status logístico" value={order.logisticsStatus} />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Produtos</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Caixas</TableHead>
                    <TableHead className="text-right">Un/Cx</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Valor un.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.product}</TableCell>
                      <TableCell className="text-right">{p.boxes}</TableCell>
                      <TableCell className="text-right">{p.unitsPerBox}</TableCell>
                      <TableCell className="text-right">{p.quantityTotal}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.saleUnit)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(p.saleUnit * p.quantityTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Faturamento</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Info label="NF principal" value={order.invoiceNumber ?? "Não faturado"} />
              <Info label="Valor faturado" value={formatCurrency(billedAmount)} highlight />
              <Info label="Valor recebido" value={formatCurrency(receivedAmount)} />
              <Info
                label="Emissão"
                value={order.invoiceIssuedAt ? formatDate(order.invoiceIssuedAt) : "-"}
              />
              <Info
                label="Vencimento"
                value={order.billingDueDate ? formatDate(order.billingDueDate) : "-"}
              />
              <Info label="Faturado por" value={order.billedBy ?? "-"} />
              <div className="md:col-span-3">
                <p className="text-xs text-muted-foreground">Observação</p>
                <p className="mt-1 font-medium text-foreground">
                  {order.billingNotes || "Sem observação registrada."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Documentos e anotações</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Documentos</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {order.documents.map((doc) => (
                    <li key={doc} className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      {doc}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Anotações</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {order.notes.map((note, i) => (
                    <li key={i}>• {note}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Progresso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Bar label="Faturamento" value={order.billingProgress} />
              <Bar label="Entrega" value={order.deliveryProgress} />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Linha do tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline items={order.timeline} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 ${highlight ? "text-lg font-semibold text-foreground" : "font-medium text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}
