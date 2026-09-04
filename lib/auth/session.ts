import { cookies } from "next/headers";

const SESSION_SECRET = process.env.SESSION_SECRET || "pgs-ims-production-session-fallback-secret-key-32";

export interface SessionPayload {
  userId: string;
  username: string;
  role: string;
  expiresAt: number;
}

const encoder = new TextEncoder();

// Base64url encoding/decoding helper (independent of Buffer/Node.js)
function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Generate the HMAC key from SESSION_SECRET
async function getHmacKey(secret: string): Promise<CryptoKey> {
  const keyData = encoder.encode(secret);
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign", "verify"]
  );
}

// 2. Token Cryptographic Signing (HMAC-SHA256)
export async function signToken(payload: SessionPayload): Promise<string> {
  const stringified = JSON.stringify(payload);
  const payloadBase64 = base64urlEncode(encoder.encode(stringified).buffer);

  const key = await getHmacKey(SESSION_SECRET);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadBase64)
  );
  const signatureBase64 = base64urlEncode(signatureBuffer);

  return `${payloadBase64}.${signatureBase64}`;
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadBase64, signatureBase64] = parts;

    const key = await getHmacKey(SESSION_SECRET);
    const isValid = await crypto.subtle.verify(
       "HMAC",
       key,
       base64urlDecode(signatureBase64) as any,
       encoder.encode(payloadBase64)
     );

    if (!isValid) return null;

    const payloadBytes = base64urlDecode(payloadBase64);
    const decoder = new TextDecoder();
    const payload = JSON.parse(decoder.decode(payloadBytes)) as SessionPayload;

    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// 3. Next.js Secure Cookie Helpers
export async function createSession(userId: string, username: string, role: string) {
  const duration = 24 * 60 * 60 * 1000; // 24 hours
  const expiresAt = Date.now() + duration;
  const payload: SessionPayload = { userId, username, role, expiresAt };
  const token = await signToken(payload);

  const cookieStore = await cookies();
  cookieStore.set("pgs_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
  return payload;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("pgs_session");
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("pgs_session")?.value;
  if (!token) return null;
  return verifyToken(token);
}
