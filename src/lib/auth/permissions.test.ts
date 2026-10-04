import { describe, expect, it } from "vitest";

import { canAccess, type AppRole } from "./permissions";

describe("role route permissions", () => {
  const expectations: Array<[AppRole, string, boolean]> = [
    ["patient", "/queue", true],
    ["patient", "/doctor", false],
    ["receptionist", "/staff", true],
    ["receptionist", "/admin", false],
    ["doctor", "/doctor", true],
    ["doctor", "/staff", true],
    ["admin", "/admin", true],
    ["admin", "/doctor", true],
  ];

  it.each(expectations)("allows %s access to %s only when authorized", (role, path, expected) => {
    expect(canAccess(role, path)).toBe(expected);
  });
});
