import crypto from "crypto";
import { IdempotencyKey } from "@/models/IdempotencyKey";

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  statusCode?: number;
  responseBody?: any;
  error?: string;
}

export function computePayloadHash(payload: any): string {
  const str = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Validates an idempotency key header or request parameter.
 * Locks the key in PROCESSING state if new.
 */
export async function lockIdempotencyKey(
  key: string,
  requestPayload: any,
  endpoint: string,
  ttlHours: number = 24
): Promise<IdempotencyCheckResult> {
  if (!key || !key.trim()) {
    return { isDuplicate: false };
  }

  const cleanKey = key.trim();
  const requestHash = computePayloadHash(requestPayload);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  const existing = await IdempotencyKey.findOne({ key: cleanKey });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return {
        isDuplicate: true,
        statusCode: 409,
        error: "Idempotency key payload mismatch. The same key cannot be used with different request parameters.",
      };
    }

    if (existing.status === "PROCESSING") {
      return {
        isDuplicate: true,
        statusCode: 409,
        error: "A request with this idempotency key is currently processing. Please wait for completion.",
      };
    }

    if (existing.status === "COMPLETED") {
      return {
        isDuplicate: true,
        statusCode: existing.statusCode || 200,
        responseBody: existing.responseBody,
      };
    }
  }

  // Create or set status to PROCESSING
  await IdempotencyKey.findOneAndUpdate(
    { key: cleanKey },
    {
      key: cleanKey,
      requestHash,
      endpoint,
      status: "PROCESSING",
      startedAt: now,
      expiresAt,
    },
    { upsert: true, new: true }
  );

  return { isDuplicate: false };
}

/**
 * Saves completed response against an idempotency key.
 */
export async function completeIdempotencyKey(
  key: string,
  statusCode: number,
  responseBody: any
) {
  if (!key || !key.trim()) return;

  await IdempotencyKey.findOneAndUpdate(
    { key: key.trim() },
    {
      status: "COMPLETED",
      statusCode,
      responseBody,
      completedAt: new Date(),
    }
  );
}

/**
 * Releases or marks idempotency key as FAILED if execution encountered an error.
 */
export async function failIdempotencyKey(key: string) {
  if (!key || !key.trim()) return;

  await IdempotencyKey.findOneAndUpdate(
    { key: key.trim() },
    {
      status: "FAILED",
      completedAt: new Date(),
    }
  );
}
