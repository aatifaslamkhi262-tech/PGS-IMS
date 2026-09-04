import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { signToken, verifyToken, SessionPayload } from "./session";

describe("Password Cryptography", () => {
  it("should generate a secure hash using PBKDF2", () => {
    const password = "SuperSecretPassword123";
    const hashedPassword = hashPassword(password);
    
    // Hash format: salt:hash_hex
    expect(hashedPassword).toContain(":");
    const [salt, hash] = hashedPassword.split(":");
    expect(salt).toHaveLength(32); // 16 bytes in hex = 32 chars
    expect(hash).toHaveLength(128); // 64 bytes in hex = 128 chars
  });

  it("should verify correct password", () => {
    const password = "myPassword";
    const hashedPassword = hashPassword(password);
    
    expect(verifyPassword(password, hashedPassword)).toBe(true);
    expect(verifyPassword("wrongPassword", hashedPassword)).toBe(false);
  });

  it("should fail gracefully on invalid stored formats", () => {
    expect(verifyPassword("password", "invalid-hash-string")).toBe(false);
    expect(verifyPassword("password", "")).toBe(false);
  });
});

describe("Cryptographic JWT Session Token", () => {
  const mockPayload: SessionPayload = {
    userId: "user-12345",
    username: "warehouse-staff",
    role: "Warehouse",
    expiresAt: Date.now() + 10000,
  };

  it("should sign and verify valid session token", async () => {
    const token = await signToken(mockPayload);
    expect(token).toContain(".");
    
    const verified = await verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(mockPayload.userId);
    expect(verified?.username).toBe(mockPayload.username);
    expect(verified?.role).toBe(mockPayload.role);
  });

  it("should reject tampered payload data", async () => {
    const token = await signToken(mockPayload);
    const parts = token.split(".");
    
    // Change first letter of payload Base64
    const originalPayload = parts[0];
    const tamperedPayload = "A" + originalPayload.substring(1);
    const tamperedToken = `${tamperedPayload}.${parts[1]}`;
    
    const verified = await verifyToken(tamperedToken);
    expect(verified).toBeNull();
  });

  it("should reject expired session tokens", async () => {
    const expiredPayload: SessionPayload = {
      ...mockPayload,
      expiresAt: Date.now() - 1000, // expired 1s ago
    };
    
    const token = await signToken(expiredPayload);
    const verified = await verifyToken(token);
    expect(verified).toBeNull();
  });
});
