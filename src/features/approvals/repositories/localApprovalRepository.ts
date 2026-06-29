import type {
  ApprovalRecord,
  ApprovalRepository,
} from "@/features/approvals/repositories/approvalRepository";

export function createLocalApprovalRepository(options?: {
  records?: ApprovalRecord[];
}): ApprovalRepository {
  const records = options?.records ?? [];

  return {
    async listPending() {
      return records.filter((record) => record.status === "pending");
    },
    async save(record: ApprovalRecord) {
      const index = records.findIndex((item) => item.id === record.id);
      if (index >= 0) records[index] = record;
      else records.unshift(record);
      return record;
    },
  };
}
