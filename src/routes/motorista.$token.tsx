import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  DRIVER_EVENT_FLOW,
  DRIVER_OCCURRENCE_TYPES,
  authenticateDriverLink,
  getNextDriverEvent,
  registerDriverEvent,
  registerDriverOccurrence,
  uploadDeliveryProof,
  type DriverEventType,
  type DriverTrip,
} from "@/lib/driverTracking";

export const Route = createFileRoute("/motorista/$token")({
  component: DriverTrackingPage,
});

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

// Regra desta entrega (fix: move freight operation tracking to driver checklist):
// SEM geolocalização. O checklist do motorista não captura latitude/longitude.

// Mensagens amigáveis para o motorista (fix: repair driver checklist and occurrence rpc errors).
// Traduz erros técnicos (RPC/400/rede) em algo acionável, sem expor detalhes internos.
function friendlyDriverError(err: unknown, context: "event" | "occurrence" | "proof"): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();
  if (
    msg.includes("expirad") ||
    msg.includes("revogad") ||
    msg.includes("expired") ||
    msg.includes("revoked") ||
    msg.includes("pin") ||
    msg.includes("token") ||
    msg.includes("inválid") ||
    msg.includes("invalid")
  ) {
    return "Link inválido, expirado ou revogado. Peça um novo acesso ao time de frete.";
  }
  if (msg.includes("not found") || msg.includes("não encontrad") || msg.includes("nao encontrad")) {
    return "Operação não encontrada.";
  }
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network") ||
    msg.includes("conexão") ||
    msg.includes("conexao")
  ) {
    return "Erro ao salvar. Verifique sua conexão e tente novamente.";
  }
  if (context === "occurrence") return "Não foi possível registrar a ocorrência. Tente novamente.";
  if (context === "proof") return "Não foi possível enviar o comprovante. Tente novamente.";
  return "Não foi possível registrar esta etapa. Tente novamente.";
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
  const [receiverName, setReceiverName] = useState("");
  const [receiverDocument, setReceiverDocument] = useState("");

  const [occurrenceOpen, setOccurrenceOpen] = useState(false);
  const [occurrenceType, setOccurrenceType] = useState<string>(DRIVER_OCCURRENCE_TYPES[0]);
  const [occurrenceNotes, setOccurrenceNotes] = useState("");
  const [occurrenceSubmitting, setOccurrenceSubmitting] = useState(false);

  const nextEvent = useMemo(() => (trip ? getNextDriverEvent(trip) : null), [trip]);
  const proofStep = nextEvent?.type === "proof_uploaded";
  const deliveryStep = nextEvent?.type === "unloaded";
  const needsReceiver = proofStep || deliveryStep;
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
    } catch (err) {
      setError(
        err instanceof Error
          ? `Não foi possível validar o acesso: ${err.message}`
          : "Não foi possível validar o acesso. Tente novamente em instantes.",
      );
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
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Formato inválido. Envie JPG, PNG ou PDF.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Arquivo muito grande (máx. 10 MB).");
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  async function submitNextEvent() {
    if (!trip || !nextEvent) return;
    if (submitting) return; // evita envio duplicado em clique rápido/duplo
    if (proofStep && !selectedFile) {
      toast.error("Anexe a foto do canhoto assinado antes de finalizar.");
      return;
    }
    if (needsReceiver && !receiverName.trim()) {
      toast.error("Informe quem recebeu a mercadoria.");
      return;
    }

    setSubmitting(true);
    try {
      const info = needsReceiver
        ? { receiverName: receiverName.trim(), receiverDocument: receiverDocument.trim() }
        : undefined;
      const updated =
        proofStep && selectedFile
          ? await uploadDeliveryProof(token, pin.trim(), selectedFile, undefined, info)
          : await registerDriverEvent(
              token,
              pin.trim(),
              nextEvent.type as Exclude<
                DriverEventType,
                "proof_uploaded" | "completed" | "occurrence" | "checkpoint"
              >,
              undefined,
              info,
            );
      // Só avança o checklist quando o banco confirma a gravação (updated vem do RPC).
      setTrip(updated);
      setSelectedFile(null);
      setPreviewUrl(null);
      toast.success(nextEvent.success);
    } catch (err) {
      toast.error(friendlyDriverError(err, proofStep ? "proof" : "event"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOccurrence() {
    if (!trip) return;
    if (occurrenceSubmitting) return; // evita ocorrência duplicada em clique rápido/duplo
    if (!occurrenceNotes.trim()) {
      toast.error("Descreva a ocorrência.");
      return;
    }
    setOccurrenceSubmitting(true);
    try {
      const updated = await registerDriverOccurrence(
        token,
        pin.trim(),
        occurrenceType,
        occurrenceNotes.trim(),
        undefined,
        undefined,
      );
      setTrip(updated);
      setOccurrenceOpen(false);
      setOccurrenceNotes("");
      toast.success("Ocorrência registrada. A equipe foi avisada.");
    } catch (err) {
      toast.error(friendlyDriverError(err, "occurrence"));
    } finally {
      setOccurrenceSubmitting(false);
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
                Digite a senha (PIN) enviada pelo responsável do frete.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Senha/PIN</label>
              <Input
                type="text"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitPin();
                }}
                placeholder="Digite a senha"
                className="h-12 bg-white text-center text-lg font-semibold tracking-widest text-slate-950 placeholder:text-slate-400"
              />
            </div>

            {error ? (
              <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
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
          <p className="text-sm text-slate-600">Acompanhamento da entrega</p>
        </div>

        {/* Resumo da operação */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg text-slate-950">
              Operação
              <Badge className="rounded-full">{statusLabel(trip.status, trip.linkState)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-900">
            <Info label="Frete" value={trip.freightId || "-"} />
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

        {/* Próxima ação */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium text-slate-600">Próxima ação</p>
            <h2 className="text-2xl font-bold text-slate-950">
              {completed
                ? "Entrega finalizada com sucesso"
                : (nextEvent?.label ?? getLockedMessage(trip.linkState))}
            </h2>

            {needsReceiver && !completed ? (
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">Dados de quem recebeu</p>
                <Input
                  placeholder="Nome do recebedor"
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  className="bg-white text-slate-950 placeholder:text-slate-500"
                />
                <Input
                  placeholder="Documento / setor (opcional)"
                  value={receiverDocument}
                  onChange={(event) => setReceiverDocument(event.target.value)}
                  className="bg-white text-slate-950 placeholder:text-slate-500"
                />
              </div>
            ) : null}

            {proofStep ? (
              <div className="space-y-3">
                <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center text-slate-900">
                  <Camera className="mb-2 h-8 w-8 text-primary" />
                  <span className="font-semibold">Foto do canhoto assinado</span>
                  <span className="mt-1 text-xs text-slate-500">
                    Obrigatório para finalizar. JPG, PNG ou PDF até 10 MB.
                  </span>
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
              {completed
                ? "Entrega concluída"
                : proofStep
                  ? "Finalizar entrega"
                  : (nextEvent?.label ?? "Indisponível")}
            </Button>
          </CardContent>
        </Card>

        {/* Ocorrência */}
        {!completed && trip.linkState === "active" ? (
          <Card className="border-amber-200 bg-white shadow-sm">
            <CardContent className="space-y-3 pt-6">
              {occurrenceOpen ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                    <AlertTriangle className="h-4 w-4" /> Registrar ocorrência
                  </p>
                  <select
                    value={occurrenceType}
                    onChange={(event) => setOccurrenceType(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900"
                  >
                    {DRIVER_OCCURRENCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <Textarea
                    placeholder="Descreva o que aconteceu"
                    value={occurrenceNotes}
                    onChange={(event) => setOccurrenceNotes(event.target.value)}
                    className="bg-white text-slate-950 placeholder:text-slate-500"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setOccurrenceOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={occurrenceSubmitting}
                      onClick={submitOccurrence}
                    >
                      {occurrenceSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Enviar"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="h-12 w-full border-amber-300 text-amber-700"
                  onClick={() => setOccurrenceOpen(true)}
                >
                  <AlertTriangle className="h-5 w-5" /> Registrar ocorrência
                </Button>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Histórico */}
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
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full ${
                      event ? "bg-primary" : active ? "bg-amber-400" : "bg-slate-200"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-slate-950">{step.label}</p>
                    <p className="text-xs text-slate-500">
                      {event ? formatDateTime(event.occurredAt) : active ? "Agora" : "Pendente"}
                      {event?.receiverName ? ` • Recebido por ${event.receiverName}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
            {trip.events
              .filter((event) => event.eventType === "occurrence")
              .map((event) => (
                <div key={event.id} className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <p className="font-medium text-amber-700">
                      {event.occurrenceType || "Ocorrência"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(event.occurredAt)}
                      {event.notes ? ` • ${event.notes}` : ""}
                    </p>
                  </div>
                </div>
              ))}
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
  if (linkState === "completed") return "Concluída";
  if (linkState === "locked") return "Bloqueada";
  if (linkState === "expired") return "Expirada";
  if (linkState === "revoked") return "Revogada";
  return (
    (
      {
        quoted: "Cotação",
        hired: "Contratado",
        loading: "Carregando",
        in_route: "Em rota",
        at_destination: "No destino",
        unloaded: "Mercadoria descarregada",
        arrived_loading: "Carregando",
        in_transit: "Em trânsito",
        arrived_delivery_location: "No destino",
        unloaded: "Descarregado",
        proof_uploaded: "Comprovante",
        delivered: "Entregue",
        completed: "Concluída",
        cancelled: "Cancelada",
      } as Record<string, string>
    )[status] ?? status
  );
}

function getAuthErrorMessage(reason?: string) {
  if (reason === "expired") return "Este link expirou. Solicite um novo acesso.";
  if (reason === "revoked") return "Este link foi revogado. Solicite um novo acesso.";
  if (reason === "locked") return "Muitas tentativas erradas. Tente novamente mais tarde.";
  if (reason === "completed") return "Esta entrega já foi concluída.";
  if (reason === "invalid_link") return "Link inválido. Confira o endereço recebido.";
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
