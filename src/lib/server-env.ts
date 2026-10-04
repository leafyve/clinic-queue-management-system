import "server-only";

export function medicalEncryptionKey() {
  const key = process.env.MEDICAL_DATA_ENCRYPTION_KEY;
  if (!key) throw new Error("MEDICAL_DATA_ENCRYPTION_KEY is not configured");
  if (Buffer.from(key, "base64").length !== 32) throw new Error("MEDICAL_DATA_ENCRYPTION_KEY must encode 32 bytes");
  return key;
}
