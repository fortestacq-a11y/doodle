import crypto from "crypto";
export * from "./encryption.js";

export function generateId(): string {
  return crypto.randomUUID();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isExpired(expiresAt: Date): boolean {
  return new Date() >= expiresAt;
}
