import {
  ensureSupabaseSession,
  getSupabaseClient,
  getSupabaseConfigStatus,
} from "@/lib/supabaseClient";
import { isSupabaseProvider } from "@/lib/dataProvider";

const DELIVERY_PROOF_BUCKET = "delivery-proofs";
const MAX_PROOF_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_PROOF_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

export type DeliveryProofUploadResult = {
  proofFileName: string;
  proofFilePath: string;
  proofFileSize: number;
  proofMimeType: string;
};

export function validateDeliveryProofFile(file: File) {
  if (!ALLOWED_PROOF_MIME_TYPES.has(file.type)) {
    return "Use PDF, JPG ou PNG para o comprovante.";
  }

  if (file.size > MAX_PROOF_FILE_SIZE) {
    return "O comprovante deve ter até 8 MB.";
  }

  return null;
}

export async function uploadDeliveryProofFile({
  deliveryId,
  file,
}: {
  deliveryId: string;
  file: File;
}): Promise<DeliveryProofUploadResult> {
  const validationMessage = validateDeliveryProofFile(file);
  if (validationMessage) throw new Error(validationMessage);

  if (!isSupabaseProvider() || !getSupabaseConfigStatus().configured) {
    throw new Error("Upload real exige Supabase configurado.");
  }

  await ensureSupabaseSession();
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");

  const proofFileName = sanitizeFileName(file.name || "comprovante");
  const proofFilePath = `${deliveryId}/${crypto.randomUUID()}-${proofFileName}`;
  const { error } = await client.storage.from(DELIVERY_PROOF_BUCKET).upload(proofFilePath, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });

  if (error) throw error;

  return {
    proofFileName,
    proofFilePath,
    proofFileSize: file.size,
    proofMimeType: file.type,
  };
}

export async function getDeliveryProofSignedUrl(path: string) {
  if (!path) throw new Error("Comprovante sem caminho de arquivo.");
  await ensureSupabaseSession();
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");

  const { data, error } = await client.storage
    .from(DELIVERY_PROOF_BUCKET)
    .createSignedUrl(path, 60 * 10);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Não foi possível gerar o link do comprovante.");
  return data.signedUrl;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}
