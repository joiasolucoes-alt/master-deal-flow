import type { FreightRecord } from "@/data/types";
import {
  ensureSupabaseSession,
  getSupabaseClient,
  getSupabaseConfigStatus,
} from "@/lib/supabaseClient";
import { isSupabaseProvider } from "@/lib/dataProvider";

const FREIGHT_DOCUMENT_BUCKET = "freight-documents";
const LOCAL_STORAGE_KEY = "master-flow:freight-documents";
const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type FreightDocumentType =
  | "driver_cnh"
  | "driver_id"
  | "driver_contact"
  | "driver_employment"
  | "driver_bank"
  | "driver_selfie"
  | "vehicle_crlv"
  | "vehicle_crlv_trailer"
  | "vehicle_antt"
  | "vehicle_owner_doc"
  | "vehicle_owner_authorization"
  | "operation_proposal"
  | "operation_contract"
  | "operation_collection_order"
  | "operation_invoice"
  | "operation_cte_mdfe"
  | "operation_insurance"
  | "operation_payment_proof"
  | "operation_toll_voucher"
  | "operation_delivery_receipt"
  | "cargo_mopp"
  | "cargo_aet"
  | "cargo_hygiene"
  | "cargo_risk_management"
  | "contract"
  | "proposal"
  | "invoice"
  | "other";

export type FreightDocumentRecord = {
  id: string;
  freightId: string;
  freightCode?: string;
  orderId?: string;
  orderNumber?: string;
  type: FreightDocumentType;
  fileName: string;
  filePath?: string;
  mimeType?: string;
  fileSize?: number;
  notes: string;
  createdAt: string;
};

type FreightDocumentRow = {
  id: string;
  freight_external_id: string;
  freight_code?: string | null;
  order_external_id?: string | null;
  order_number?: string | null;
  document_type: string;
  file_name: string;
  file_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

export const FREIGHT_DOCUMENT_TYPE_LABEL: Record<FreightDocumentType, string> = {
  driver_cnh: "CNH do motorista",
  driver_id: "CPF/RG do motorista",
  driver_contact: "Contato do motorista",
  driver_employment: "Vínculo (autônomo/transportadora)",
  driver_bank: "Dados bancários / PIX",
  driver_selfie: "Foto/selfie do motorista",
  vehicle_crlv: "CRLV do cavalo/caminhão",
  vehicle_crlv_trailer: "CRLV da carreta",
  vehicle_antt: "RNTRC / ANTT",
  vehicle_owner_doc: "Documento do proprietário",
  vehicle_owner_authorization: "Autorização de uso do veículo",
  operation_proposal: "Proposta de frete",
  operation_contract: "Contrato / aceite do frete",
  operation_collection_order: "Ordem de coleta",
  operation_invoice: "NF da mercadoria",
  operation_cte_mdfe: "CT-e / MDF-e",
  operation_insurance: "Seguro / averbação da carga",
  operation_payment_proof: "Comprovante pagamento / sinal",
  operation_toll_voucher: "Vale-pedágio",
  operation_delivery_receipt: "Canhoto / comprovante de entrega",
  cargo_mopp: "MOPP + ficha de emergência",
  cargo_aet: "AET - Autorização especial",
  cargo_hygiene: "Comprovante de higienização",
  cargo_risk_management: "Gerenciadora de risco / PGR",
  contract: "Contrato (legado)",
  proposal: "Proposta (legado)",
  invoice: "Nota / documento (legado)",
  other: "Outro",
};

export function validateFreightDocumentFile(file: File) {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.type)) {
    return "Use PDF, JPG ou PNG para o documento do frete.";
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    return "O documento do frete deve ter até 10 MB.";
  }

  return null;
}

export async function listFreightDocuments(freightId: string): Promise<FreightDocumentRecord[]> {
  if (!isSupabaseProvider()) {
    return readLocalFreightDocuments().filter((document) => document.freightId === freightId);
  }

  if (!getSupabaseConfigStatus().configured) return [];

  await ensureSupabaseSession();
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");

  const { data, error } = await client
    .from("freight_documents")
    .select("*")
    .eq("freight_external_id", freightId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Prepare o banco com o SQL 015 para listar documentos de frete.");
  }

  return ((data ?? []) as FreightDocumentRow[]).map(rowToFreightDocument);
}

export async function saveFreightDocument({
  freight,
  type,
  file,
  notes,
}: {
  freight: FreightRecord;
  type: FreightDocumentType;
  file: File;
  notes: string;
}): Promise<FreightDocumentRecord> {
  const validationMessage = validateFreightDocumentFile(file);
  if (validationMessage) throw new Error(validationMessage);

  if (!isSupabaseProvider()) {
    const document: FreightDocumentRecord = {
      id: crypto.randomUUID(),
      freightId: freight.id,
      freightCode: freight.code,
      orderId: freight.orderId,
      orderNumber: freight.orderNumber,
      type,
      fileName: sanitizeFileName(file.name || "documento-frete"),
      mimeType: file.type,
      fileSize: file.size,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };
    const documents = [document, ...readLocalFreightDocuments()];
    writeLocalFreightDocuments(documents);
    return document;
  }

  if (!getSupabaseConfigStatus().configured) {
    throw new Error("Upload real exige Supabase configurado.");
  }

  await ensureSupabaseSession();
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");

  const fileName = sanitizeFileName(file.name || "documento-frete");
  const filePath = `${freight.id}/${crypto.randomUUID()}-${fileName}`;
  const { error: uploadError } = await client.storage
    .from(FREIGHT_DOCUMENT_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Falha no upload. Confirme se o SQL 015 foi rodado no Supabase.");
  }

  const row = {
    freight_external_id: freight.id,
    freight_code: freight.code,
    order_external_id: freight.orderId ?? null,
    order_number: freight.orderNumber ?? null,
    document_type: type,
    file_name: fileName,
    file_path: filePath,
    mime_type: file.type,
    file_size: file.size,
    notes: notes.trim() || null,
  };

  const { data, error } = await client.from("freight_documents").insert(row).select("*").single();

  if (error) {
    throw new Error("Falha ao salvar o documento. Confirme se o SQL 015 foi rodado.");
  }

  return rowToFreightDocument(data as FreightDocumentRow);
}

export async function getFreightDocumentSignedUrl(path: string) {
  if (!path) throw new Error("Documento sem caminho de arquivo.");
  await ensureSupabaseSession();
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");

  const { data, error } = await client.storage
    .from(FREIGHT_DOCUMENT_BUCKET)
    .createSignedUrl(path, 60 * 10);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Não foi possível gerar o link do documento.");
  return data.signedUrl;
}

function rowToFreightDocument(row: FreightDocumentRow): FreightDocumentRecord {
  return {
    id: row.id,
    freightId: row.freight_external_id,
    freightCode: row.freight_code ?? undefined,
    orderId: row.order_external_id ?? undefined,
    orderNumber: row.order_number ?? undefined,
    type: normalizeDocumentType(row.document_type),
    fileName: row.file_name,
    filePath: row.file_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    notes: row.notes ?? "",
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function normalizeDocumentType(type: string): FreightDocumentType {
  if (type in FREIGHT_DOCUMENT_TYPE_LABEL) {
    return type as FreightDocumentType;
  }
  return "other";
}

function readLocalFreightDocuments(): FreightDocumentRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalFreightDocuments(documents: FreightDocumentRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(documents));
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}
