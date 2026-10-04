import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function decodeKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("MEDICAL_DATA_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function seal(value: string, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function open(payload: string, encodedKey: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts.slice(1).some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("Invalid encrypted payload");
  const [version, ivValue, tagValue, ciphertextValue] = parts;
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted payload");
  if (Buffer.from(ivValue, "base64url").length !== 12 || Buffer.from(tagValue, "base64url").length !== 16) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", decodeKey(encodedKey), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
