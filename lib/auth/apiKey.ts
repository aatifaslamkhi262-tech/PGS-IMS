import { NextRequest } from "next/server";

const DEFAULT_ECOMMERCE_API_KEY = "pgs_ecommerce_secret_key_2026";

export function verifyApiKey(req: NextRequest): { authorized: boolean; error?: string } {
  const configuredApiKey = process.env.ECOMMERCE_API_KEY || DEFAULT_ECOMMERCE_API_KEY;
  const reqApiKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");

  if (!reqApiKey || reqApiKey.trim() !== configuredApiKey.trim()) {
    return {
      authorized: false,
      error: "Unauthorized: Invalid or missing x-api-key header.",
    };
  }

  return { authorized: true };
}
