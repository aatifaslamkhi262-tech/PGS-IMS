import crypto from "crypto";
import { HRAuditLog, AuditModule } from "@/models/HRAuditLog";
import { Types } from "mongoose";

export interface RecordAuditParams {
  action: string;
  module: AuditModule;
  targetId?: string;
  targetLabel: string;
  valueBefore?: any;
  valueAfter?: any;
  reason: string;
  performedBy?: string | Types.ObjectId | null;
  performedByName?: string;
  ipAddress?: string;
}

/**
 * Writes an append-only, hash-chained audit entry to HRAuditLog.
 */
export async function recordHRAuditLog(params: RecordAuditParams) {
  const lastEntry = await HRAuditLog.findOne({})
    .sort({ createdAt: -1, _id: -1 })
    .select("entryHash")
    .lean();

  const previousHash = lastEntry?.entryHash || "GENESIS_BLOCK_PGS_HR_V3";
  const timestampIso = new Date().toISOString();

  const payloadToHash = JSON.stringify({
    previousHash,
    action: params.action,
    module: params.module,
    targetId: params.targetId || "",
    targetLabel: params.targetLabel,
    valueBefore: params.valueBefore ?? null,
    valueAfter: params.valueAfter ?? null,
    reason: params.reason,
    performedByName: params.performedByName || "System",
    timestampIso,
  });

  const entryHash = crypto
    .createHash("sha256")
    .update(payloadToHash)
    .digest("hex");

  const entry = await HRAuditLog.create({
    action: params.action,
    module: params.module,
    targetId: params.targetId || "",
    targetLabel: params.targetLabel,
    valueBefore: params.valueBefore ?? null,
    valueAfter: params.valueAfter ?? null,
    reason: params.reason,
    performedBy: params.performedBy
      ? new Types.ObjectId(params.performedBy.toString())
      : null,
    performedByName: params.performedByName || "System",
    ipAddress: params.ipAddress || "127.0.0.1",
    previousHash,
    entryHash,
  });

  return entry;
}

