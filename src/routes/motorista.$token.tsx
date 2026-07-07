import { createFileRoute } from "@tanstack/react-router";
import {
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  LockKeyhole,
  MapPin,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  DRIVER_EVENT_FLOW,
  authenticateDriverLink,
  getNextDriverEvent,
  registerDriverEvent,
  uploadDeliveryProof,
  type DriverEventType,
  type DriverTrip,
} from "@/lib/driverTracking";

export const Route = createFileRoute("/motorista/$token")({
  component: DriverTrackingPage,
});

const MAX_FILE_SIZE = 10 * 1024 * 1024;
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
  const [pin, setPin] = useState("");
  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const nextEvent = useMemo(() => (trip ? getNextDriverEvent(trip) : null), [trip]);
  const proofStep = nextEvent?.type === "proof_uploaded";
  const completed = trip?.linkState === "completed" || trip?.nextEvent === "completed";

  async function submitPin() {
    if (pin.trim().length < 4) {
      setError("Digite a senha enviada pelo responsável do frete.");
      return;
    }
    setAuthenticating(true);
    setError(null);
    try {
      const result = await authenticateDriverLink(token, pin.trim());
      if (!result.ok) {
        setError(getAuthErrorMessage(result.reason));
        return;
      }
      setTrip(result.trip);
    } catch {
      setError("Não foi possível validar o acesso. Tente novamente em instantes.");
    } finally {
      setAuthenticating(false);
    }
  }

  function handleSelectFile(file?: File) {
    if (!file) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE) {
      toast.error("Envie JPG, PNG ou PDF com até 10 MB.");
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  async function submitNextEvent() {
    if (!trip || !nextEvent) return;
    if (proofStep && !selectedFile) {
      toast.error("Tire uma foto ou selecione o comprovante antes de enviar.");
      return;
    }

    setSubmitting(true);
    try {
      const coords = await getLocation();
      const updated =
        proofStep && selectedFile
          ? await uploadDeliveryProof(token, pin.trim(), selectedFile, coords)
          : await registerDriverEvent(
              token,
              pin.trim(),
              nextEvent.type as Exclude<DriverEventType, "proof_uploaded" | "completed">,
              coords,
            );
      setTrip(updated);
      setSelectedFile(null);
      setPreviewUrl(null);
      toast.success(nextEvent.success);
    } catch {
      toast.error(proofStep ? "Falha ao enviar comprovante." : "Falha ao registrar etapa.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!trip) {
    return (
      <PublicShell>
        <Card className="border-slate-200 bg-white shadow-lg">
          <CardContent className="space-y-5 pt-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Truck className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold text-slate-950">Master Flow</h1>
              <p className="mt-1 text-sm text-slate-600">
                Digite a senha enviada pelo responsável do frete.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Senha/PIN</label>
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitPin();
                }}
                placeholder="Digite a senha"
                className="h-12 text-center text-lg tracking-widest"
              />
            </div>

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <Button size="lg" className="h-12 w-full" disabled={authenticating} onClick={submitPin}>
              {authenticating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LockKeyhole className="h-5 w-5" />
              )}
              Acessar entrega
            </Button>
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
          <h1 className="text-2xl font-bold text-slate-950">Master Flow</h1>
          <p className="text-sm text-slate-600">Entrega do motorista</p>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg text-slate-950">
              Entrega
              <Badge className="rounded-full">{statusLabel(trip.status, trip.linkState)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-900">
            <Info label="Motorista" value={trip.driverName || "Não informado"} />
            <Info label="Placa" value={trip.vehiclePlate || "Não informada"} />
            <RoutePoint
              title="Coleta"
              address={trip.pickupAddress || "Local de coleta"}
              city={formatCity(trip.pickupCity, trip.pickupState)}
            />
            <RoutePoint
              title="Entrega"
              address={trip.deliveryAddress || "Local de entrega"}
              city={formatCity(trip.deliveryCity, trip.deliveryState)}
            />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium text-slate-600">Próxima ação</p>
            <h2 className="text-2xl font-bold text-slate-950">
              {completed
                ? "Entrega registrada com sucesso"
                : (nextEvent?.label ?? getLockedMessage(trip.linkState))}
            </h2>
            {proofStep ? (
              <div className="space-y-3">
                <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center text-slate-900">
                  <Camera className="mb-2 h-8 w-8 text-primary" />
                  <span className="font-semibold">Tirar foto ou selecionar comprovante</span>
                  <span className="mt-1 text-xs text-slate-500">JPG, PNG ou PDF até 10 MB</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    capture="environment"
                    onChange={(event) => handleSelectFile(event.target.files?.[0])}
                  />
                </label>
                {selectedFile ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview do comprovante"
                        className="max-h-60 w-full rounded-xl object-contain"
                      />
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-slate-800">
                        <FileText className="h-4 w-4" /> {selectedFile.name}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button
              size="lg"
              className="h-14 w-full text-base"
              disabled={locked || submitting}
              onClick={submitNextEvent}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              {completed ? "Tudo certo" : (nextEvent?.label ?? "Indisponível")}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">Etapas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {DRIVER_EVENT_FLOW.map((step) => {
              const event = trip.events.find((item) => item.eventType === step.type);
              const active = nextEvent?.type === step.type;
              return (
                <div key={step.type} className="flex gap-3">
                  <div
                    className={`mt-1 h-4 w-4 rounded-full ${
                      event ? "bg-primary" : active ? "bg-amber-400" : "bg-slate-200"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-slate-950">{step.label}</p>
                    <p className="text-xs text-slate-500">
                      {event ? formatDateTime(event.occurredAt) : active ? "Agora" : "Pendente"}
                      {event?.latitude ? " - localizacao registrada" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-md">{children}</div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  );
}

function RoutePoint({ title, address, city }: { title: string; address: string; city: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-3">
      <p className="flex items-center gap-2 font-medium">
        <MapPin className="h-4 w-4 text-primary" />
        {title}
      </p>
      <p className="mt-1 text-slate-600">{address}</p>
      <p className="font-medium">{city}</p>
    </div>
  );
}

function statusLabel(status: string, linkState: DriverTrip["linkState"]) {
  if (linkState === "completed") return "Concluida";
  if (linkState === "locked") return "Bloqueada";
  if (linkState === "expired") return "Expirada";
  if (linkState === "revoked") return "Revogada";
  return (
    (
      {
        quoted: "Cotacao",
        hired: "Contratado",
        loading: "Carregando",
        in_route: "Em rota",
        arrived_loading: "Carregando",
        in_transit: "Em transito",
        arrived_delivery_location: "No destino",
        unloaded: "Descarregado",
        proof_uploaded: "Comprovante",
        delivered: "Entregue",
        completed: "Concluida",
        cancelled: "Cancelada",
      } as Record<string, string>
    )[status] ?? status
  );
}

function getAuthErrorMessage(reason?: string) {
  if (reason === "expired") return "Este link expirou. Solicite um novo acesso.";
  if (reason === "revoked") return "Este link foi revogado. Solicite um novo acesso.";
  if (reason === "locked") return "Muitas tentativas erradas. Tente novamente mais tarde.";
  if (reason === "completed") return "Esta entrega ja foi concluida.";
  if (reason === "invalid_link") return "Link invalido. Confira o endereço recebido.";
  return "Senha incorreta. Confira o PIN recebido e tente novamente.";
}

function getLockedMessage(linkState: DriverTrip["linkState"]) {
  if (linkState === "expired") return "Link expirado";
  if (linkState === "revoked") return "Link revogado";
  if (linkState === "locked") return "Acesso bloqueado temporariamente";
  return "Entrega finalizada";
}

function formatCity(city: string, state: string) {
  if (city && state) return `${city}/${state}`;
  return city || state || "Não informado";
}
