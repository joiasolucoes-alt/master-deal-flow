import type { FreightCargoType, FreightRecord } from "@/data/types";
import type {
  FreightDocumentRecord,
  FreightDocumentType,
} from "@/features/freights/freightDocumentStorage";

export type FreightChecklistBlock = "driver" | "vehicle" | "operation" | "delivery";

export type FreightChecklistItem = {
  type: FreightDocumentType;
  label: string;
  block: FreightChecklistBlock;
  requiredFor: "contract" | "release_driver" | "finalize" | "optional";
  helper?: string;
};

export const FREIGHT_CHECKLIST_CATALOG: FreightChecklistItem[] = [
  // Motorista
  { type: "driver_cnh", label: "CNH válida", block: "driver", requiredFor: "contract", helper: "Categoria compatível com o veículo." },
  { type: "driver_id", label: "CPF/RG (ou CNH com CPF)", block: "driver", requiredFor: "contract" },
  { type: "driver_contact", label: "Contato/WhatsApp do motorista", block: "driver", requiredFor: "contract", helper: "Necessário para envio do link e coleta." },
  { type: "driver_employment", label: "Vínculo (autônomo/transportadora)", block: "driver", requiredFor: "contract" },
  { type: "driver_bank", label: "Dados bancários / PIX", block: "driver", requiredFor: "optional", helper: "Se o pagamento for direto ao motorista." },
  { type: "driver_selfie", label: "Foto/selfie do motorista", block: "driver", requiredFor: "optional" },

  // Veículo
  { type: "vehicle_crlv", label: "CRLV do cavalo/caminhão", block: "vehicle", requiredFor: "contract" },
  { type: "vehicle_crlv_trailer", label: "CRLV da carreta", block: "vehicle", requiredFor: "optional", helper: "Obrigatório quando houver conjunto com carreta." },
  { type: "vehicle_antt", label: "RNTRC / ANTT", block: "vehicle", requiredFor: "contract" },
  { type: "vehicle_owner_doc", label: "Documento do proprietário do veículo", block: "vehicle", requiredFor: "optional", helper: "Quando o veículo não é da transportadora/motorista." },
  { type: "vehicle_owner_authorization", label: "Autorização de uso do veículo", block: "vehicle", requiredFor: "optional", helper: "Quando o motorista não é o proprietário." },

  // Operação
  { type: "operation_proposal", label: "Proposta de frete", block: "operation", requiredFor: "contract" },
  { type: "operation_contract", label: "Contrato / aceite do frete", block: "operation", requiredFor: "contract" },
  { type: "operation_collection_order", label: "Ordem de coleta / carregamento", block: "operation", requiredFor: "release_driver" },
  { type: "operation_invoice", label: "NF da mercadoria", block: "operation", requiredFor: "release_driver" },
  { type: "operation_cte_mdfe", label: "CT-e / MDF-e", block: "operation", requiredFor: "optional", helper: "Depende de quem emite o documento fiscal." },
  { type: "operation_insurance", label: "Seguro / averbação da carga", block: "operation", requiredFor: "optional" },
  { type: "operation_payment_proof", label: "Comprovante pagamento / sinal", block: "operation", requiredFor: "optional", helper: "Quando exigido antes da coleta." },
  { type: "operation_toll_voucher", label: "Vale-pedágio / comprovante", block: "operation", requiredFor: "optional" },

  // Condicionais por carga
  { type: "cargo_mopp", label: "Curso MOPP + ficha de emergência", block: "operation", requiredFor: "optional", helper: "Obrigatório para carga perigosa." },
  { type: "cargo_aet", label: "AET (autorização especial de trânsito)", block: "operation", requiredFor: "optional", helper: "Obrigatório para excesso de peso/dimensão." },
  { type: "cargo_hygiene", label: "Comprovante de higienização", block: "operation", requiredFor: "optional", helper: "Obrigatório para alimentos/carga sensível." },
  { type: "cargo_risk_management", label: "Gerenciadora de risco / PGR", block: "operation", requiredFor: "optional", helper: "Obrigatório para carga com rastreamento." },

  // Final
  { type: "operation_delivery_receipt", label: "Canhoto / comprovante de entrega", block: "delivery", requiredFor: "finalize" },
];

export function getCatalogItem(type: FreightDocumentType): FreightChecklistItem | undefined {
  return FREIGHT_CHECKLIST_CATALOG.find((item) => item.type === type);
}

export function getBlockItems(
  block: FreightChecklistBlock,
  cargoType?: FreightCargoType,
): FreightChecklistItem[] {
  return FREIGHT_CHECKLIST_CATALOG.filter((item) => {
    if (item.block !== block) return false;
    if (item.type === "cargo_mopp" && cargoType !== "perigosa") return false;
    if (item.type === "cargo_aet" && cargoType !== "excesso") return false;
    if (item.type === "cargo_hygiene" && cargoType !== "refrigerada") return false;
    if (item.type === "cargo_risk_management" && cargoType !== "rastreada") return false;
    return true;
  });
}

export function isRequiredForCargo(item: FreightChecklistItem, cargoType?: FreightCargoType) {
  if (item.type === "cargo_mopp") return cargoType === "perigosa";
  if (item.type === "cargo_aet") return cargoType === "excesso";
  if (item.type === "cargo_hygiene") return cargoType === "refrigerada";
  if (item.type === "cargo_risk_management") return cargoType === "rastreada";
  return item.requiredFor !== "optional";
}

export type FreightChecklistStatus = {
  driverReady: boolean;
  vehicleReady: boolean;
  operationReady: boolean;
  driverCount: { done: number; total: number };
  vehicleCount: { done: number; total: number };
  operationCount: { done: number; total: number };
  canContract: boolean;
  canReleaseDriver: boolean;
  canFinalize: boolean;
  missingForContract: string[];
  missingForRelease: string[];
};

function isDocumentAttached(type: FreightDocumentType, documents: FreightDocumentRecord[]) {
  return documents.some((doc) => doc.type === type);
}

export function getChecklistStatus(
  freight: FreightRecord,
  documents: FreightDocumentRecord[],
): FreightChecklistStatus {
  const cargo = freight.cargoType ?? "comum";
  const missingForContract: string[] = [];
  const missingForRelease: string[] = [];

  const countBlock = (
    block: FreightChecklistBlock,
    gate: "contract" | "release_driver",
  ) => {
    const items = getBlockItems(block, cargo).filter(
      (item) =>
        item.requiredFor === "contract" ||
        (gate === "release_driver" && item.requiredFor === "release_driver"),
    );
    let done = 0;
    items.forEach((item) => {
      const attached = isDocumentAttached(item.type, documents);
      if (attached) done += 1;
      else {
        if (item.requiredFor === "contract") missingForContract.push(item.label);
        if (item.requiredFor === "release_driver") missingForRelease.push(item.label);
      }
    });
    return { done, total: items.length };
  };

  const driverCount = countBlock("driver", "contract");
  const vehicleCount = countBlock("vehicle", "contract");
  const operationCount = countBlock("operation", "release_driver");

  const hasCoreFields =
    Boolean(freight.carrierName?.trim()) &&
    Boolean(freight.driverName?.trim()) &&
    Boolean(freight.vehiclePlate?.trim()) &&
    freight.freightValue > 0 &&
    Boolean(freight.freightPaymentDueDate);

  if (!hasCoreFields) {
    missingForContract.push(
      "Dados básicos (transportadora, motorista, placa, valor e data de pagamento)",
    );
  }

  const canContract =
    hasCoreFields &&
    driverCount.done === driverCount.total &&
    vehicleCount.done === vehicleCount.total;

  const canReleaseDriver = canContract && operationCount.done === operationCount.total;

  const canFinalize = isDocumentAttached("operation_delivery_receipt", documents);

  return {
    driverReady: driverCount.done === driverCount.total,
    vehicleReady: vehicleCount.done === vehicleCount.total,
    operationReady: operationCount.done === operationCount.total,
    driverCount,
    vehicleCount,
    operationCount,
    canContract,
    canReleaseDriver,
    canFinalize,
    missingForContract,
    missingForRelease,
  };
}

export const FREIGHT_CARGO_TYPE_LABEL: Record<FreightCargoType, string> = {
  comum: "Comum",
  perigosa: "Perigosa (MOPP)",
  refrigerada: "Refrigerada / sensível",
  excesso: "Excesso peso/dimensão",
  rastreada: "Rastreamento obrigatório",
};
