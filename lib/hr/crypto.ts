import crypto from "crypto";

const SECRET_SEED =
  process.env.HR_ENCRYPTION_KEY ||
  process.env.SESSION_SECRET ||
  "pgs-ims-hr-encryption-default-secret-key-2026";

function getEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(SECRET_SEED).digest();
}

/**
 * Encrypts sensitive CNIC string using AES-256-GCM.
 */
export function encryptCNIC(plainCnic: string): string {
  const cleaned = plainCnic.replace(/[^0-9]/g, "");
  if (!cleaned) return "";

  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(cleaned, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts AES-256-GCM encrypted CNIC for authorized Admin/HR view.
 */
export function decryptCNIC(encryptedPayload?: string): string {
  if (!encryptedPayload) return "";
  try {
    const parts = encryptedPayload.split(":");
    if (parts.length !== 3) return "";
    const [ivHex, tagHex, dataHex] = parts;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    return formatCNIC(decrypted.toString("utf8"));
  } catch {
    return "";
  }
}

export function formatCNIC(digitsOnly: string): string {
  const d = digitsOnly.replace(/[^0-9]/g, "");
  if (d.length === 13) {
    return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
  }
  return digitsOnly;
}

/**
 * Creates a masked CNIC display string e.g. *****-****123-4
 */
export function maskCNIC(plainCnic: string): string {
  const d = plainCnic.replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.length >= 4) {
    const last4 = d.slice(-4);
    return `*****-****${last4.slice(0, 3)}-${last4.slice(3)}`;
  }
  return "*****-*******-*";
}

/**
 * Generates an unguessable random Card UID (not sequential).
 * Format: CRD-XXXXXXXX (8 random uppercase hex/alphanumeric characters)
 */
export function generateCardUid(): string {
  const randomHex = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `CRD-${randomHex}`;
}

/**
 * Hashes a 4-digit backup PIN using PBKDF2-SHA256.
 */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(8).toString("hex");
  const derived = crypto
    .pbkdf2Sync(pin.trim(), salt, 10000, 32, "sha256")
    .toString("hex");
  return `${salt}:${derived}`;
}

/**
 * Verifies a 4-digit backup PIN against stored hash.
 */
export function verifyPin(pin: string, storedHash?: string): boolean {
  if (!storedHash || !pin) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto
    .pbkdf2Sync(pin.trim(), salt, 10000, 32, "sha256")
    .toString("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(originalHex, "hex"),
      Buffer.from(derived, "hex")
    );
  } catch {
    return false;
  }
}

