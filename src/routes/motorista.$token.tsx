import { createFileRoute } from "@tanstack/react-router";
import { Camera, CheckCircle2, FileText, Loader2, MapPin, ShieldAlert, Truck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  DRIVER_EVENT_FLOW,
  fetchDriverTrip,
  getNextDriverEvent,
  registerDriverEvent,
  uploadDeliveryProof,
  type DriverTrip,
} from "@/lib/driverTracking";

export const Route = createFileRoute("/motorista/$token")({
  component: DriverTrackingPage,
});

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

function getLocation() {
  return new Promise<{ latitude: number; longitude: number } | undefined>((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

function DriverTrackingPage() {
  const { token } = Route.useParams();
  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchDriverTrip(token)
      .then((result) => {
        if (!result) setError("Link inválido. Confira o endereço recebido e tente novamente.");
        setTrip(result);
      })
      .catch(() => setError("Não foi possível carregar a entrega. Tente novamente em instantes."))
      .finally(() => setLoading(false));
  }, [token]);

  const nextEvent = useMemo(() => (trip ? getNextDriverEvent(trip) : null), [trip]);
  const proofStep = nextEvent?.type === "proof_uploaded";

  async function submitNextEvent() {
    if (!nextEvent) return;
    if (proofStep && !selectedFile) {
      toast.error("Selecione ou fotografe o comprovante assinado antes de enviar.");
      return;
    }
    if (
      selectedFile &&
      (!ALLOWED_TYPES.has(selectedFile.type) || selectedFile.size > MAX_FILE_SIZE)
    ) {
      toast.error("Arquivo inválido. Envie JPG, PNG ou PDF com até 8 MB.");
      return;
    }
    setSubmitting(true);
    try {
      const coords = await getLocation();
      const updated =
        proofStep && selectedFile
          ? await uploadDeliveryProof(token, selectedFile, coords)
          : await registerDriverEvent(token, nextEvent.type, coords);
      setTrip(updated);
      setSelectedFile(null);
      toast.success(nextEvent.success);
    } catch {
      toast.error(proofStep ? "Falha ao anexar comprovante." : "Falha ao registrar evento.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <PublicShell>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-center text-sm text-muted-foreground">Carregando entrega...</p>
      </PublicShell>
    );
  }

  if (error || !trip) {
    return (
      <PublicShell>
        <Card>
          <CardContent className="space-y-3 pt-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-danger" />
            <h1 className="text-xl font-semibold">Link indisponível</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  const locked = trip.linkState !== "active" || !nextEvent;

  return (
    <PublicShell>
      <div className="space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Truck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Master Flow</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento público do motorista</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              Viagem <Badge>{statusLabel(trip.status)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Info label="Motorista" value={trip.driverName || "Não informado"} />
            <Info label="Placa" value={trip.vehiclePlate || "Não informada"} />
            <RoutePoint
              title="Coleta"
              address={trip.pickupAddress}
              city={`${trip.pickupCity}/${trip.pickupState}`}
            />
            <RoutePoint
              title="Entrega"
              address={trip.deliveryAddress}
              city={`${trip.deliveryCity}/${trip.deliveryState}`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {DRIVER_EVENT_FLOW.map((step) => {
              const event = trip.events.find((item) => item.eventType === step.type);
              return (
                <div key={step.type} className="flex gap-3">
                  <div
                    className={`mt-1 h-3 w-3 rounded-full ${event ? "bg-primary" : "bg-muted"}`}
                  />
                  <div>
                    <p className="font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {event ? formatDateTime(event.occurredAt) : "Pendente"}
                      {event?.latitude ? ` • localização registrada` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-6">
            {proofStep && (
              <div className="space-y-2">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-5 text-center">
                  <Camera className="mb-2 h-6 w-6 text-primary" />
                  <span className="font-medium">Tirar foto ou selecionar comprovante</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG ou PDF até 8 MB</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    capture="environment"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {selectedFile && (
                  <p className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
                    <FileText className="h-4 w-4" /> {selectedFile.name}
                  </p>
                )}
              </div>
            )}
            <Button
              size="lg"
              className="w-full"
              disabled={locked || submitting}
              onClick={submitNextEvent}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {locked ? "Entrega bloqueada para alterações" : nextEvent?.label}
            </Button>
            {trip.linkState !== "active" && (
              <p className="text-center text-xs text-muted-foreground">
                Este link está{" "}
                {trip.linkState === "expired"
                  ? "expirado"
                  : trip.linkState === "revoked"
                    ? "revogado"
                    : "concluído"}
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-foreground">
      <div className="mx-auto max-w-md">{children}</div>
    </main>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  );
}
function RoutePoint({ title, address, city }: { title: string; address: string; city: string }) {
  return (
    <div className="rounded-2xl bg-muted p-3">
      <p className="flex items-center gap-2 font-medium">
        <MapPin className="h-4 w-4 text-primary" />
        {title}
      </p>
      <p className="mt-1 text-muted-foreground">{address}</p>
      <p className="font-medium">{city}</p>
    </div>
  );
}
function statusLabel(status: string) {
  return (
    (
      {
        quoted: "Cotação",
        hired: "Contratado",
        loading: "Carregando",
        in_route: "Em rota",
        contracted: "Contratado",
        arrived_pickup: "Chegou para coleta",
        loaded: "Carregado",
        in_transit: "Em trânsito",
        delivered: "Entregue",
        proof_uploaded: "Comprovante anexado",
        completed: "Concluído",
        cancelled: "Cancelado",
      } as Record<string, string>
    )[status] ?? status
  );
}
