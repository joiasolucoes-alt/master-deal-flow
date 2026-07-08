import {
  ensureSupabaseSession,
  getSupabaseClient,
  getSupabaseConfigStatus,
} from "@/lib/supabaseClient";
import { isSupabaseProvider } from "@/lib/dataProvider";

const PAYMENT_PROOF_BUCKET = "delivery-proofs";
const MAX_PAYMENT_PROOF_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_PAYMENT_PROOF_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type PaymentProofUploadResult = {
  proofFileName: string;
  proofFilePath?: string;
  proofFileSize: number;
  proofMimeType: string;
};

export function validatePaymentProofFile(file: File) {
  if (!ALLOWED_PAYMENT_PROOF_MIME_TYPES.has(file.type)) {
    return "Use PDF, JPG ou PNG para o comprovante de pagamento.";
  }

  if (file.size > MAX_PAYMENT_PROOF_FILE_SIZE) {
    return "O comprovante de pagamento deve ter até 10 MB.";
  }

  return null;
}

export async function uploadPaymentProofFile({
  titleId,
  file,
}: {
  titleId: string;
  file: File;
}): Promise<PaymentProofUploadResult> {
  const validationMessage = validatePaymentProofFile(file);
  if (validationMessage) throw new Error(validationMessage);

  const proofFileName = sanitizeFileName(file.name || "comprovante-pagamento");

  if (!isSupabaseProvider()) {
    return {
      proofFileName,
      proofFileSize: file.size,
      proofMimeType: file.type,
    };
  }

  if (!getSupabaseConfigStatus().configured) {
    throw new Error("Upload real exige Supabase configurado.");
  }

  await ensureSupabaseSession();
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");

  const proofFilePath = `financial-payments/${titleId}/${crypto.randomUUID()}-${proofFileName}`;
  const { error } = await client.storage.from(PAYMENT_PROOF_BUCKET).upload(proofFilePath, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error("Falha ao anexar comprovante. Confirme o bucket delivery-proofs no Supabase.");
  }

  return {
    proofFileName,
    proofFilePath,
    proofFileSize: file.size,
    proofMimeType: file.type,
  };
}

export async function getPaymentProofSignedUrl(path: string) {
  if (!path) throw new Error("Comprovante sem caminho de arquivo.");
  await ensureSupabaseSession();
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");

  const { data, error } = await client.storage
    .from(PAYMENT_PROOF_BUCKET)
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
