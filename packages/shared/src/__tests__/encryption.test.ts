import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "../utils/encryption.js";

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Set the env key before tests
process.env.ENCRYPTION_KEY = TEST_KEY;

describe("Encryption Utils", () => {
  it("encrypt then decrypt returns original value", () => {
    const original = "my-secret-oauth-token";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("encrypted output has correct format (iv:tag:ciphertext)", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    expect(parts.length).toBe(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it("decrypt with wrong key throws", () => {
    const encrypted = encrypt("test");
    const oldKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(() => decrypt(encrypted)).toThrow();
    process.env.ENCRYPTION_KEY = oldKey;
  });

  it("different encryptions of same text produce different ciphertext", () => {
    const enc1 = encrypt("test");
    const enc2 = encrypt("test");
    expect(enc1).not.toBe(enc2);
  });
});
