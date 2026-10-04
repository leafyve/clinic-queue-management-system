import { describe, expect, it } from "vitest";

import { open, seal } from "./encryption";

const key = Buffer.alloc(32, 7).toString("base64");

describe("medical data encryption", () => {
  it("round trips clinical text without exposing it in the stored value", () => {
    const encrypted = seal("Penicillin allergy", key);

    expect(encrypted).not.toContain("Penicillin");
    expect(open(encrypted, key)).toBe("Penicillin allergy");
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = seal("Private consultation note", key);
    const tampered = `${encrypted.slice(0, -2)}aa`;

    expect(() => open(tampered, key)).toThrow();
  });
  it("rejects a missing or wrong-size key, wrong key, and malformed ciphertext", () => {
    expect(() => seal("LOCAL TEST", "")).toThrow();
    expect(() => open(seal("LOCAL TEST",key),Buffer.alloc(32,8).toString("base64"))).toThrow();
    for (const value of ["plaintext","v2.bad.bad.bad","v1.bad.bad.bad"]) expect(() => open(value,key)).toThrow();
  });
  it("rejects trailing fields and malformed GCM lengths instead of silently ignoring fields", () => {
    const payload = seal("LOCAL TEST", key);
    expect(() => open(`${payload}.extra`, key)).toThrow();
    expect(() => open(payload.replace(payload.split(".")[1], "abcd"), key)).toThrow();
  });
});
