import { describe,expect,it } from "vitest";
import { safeNextPath } from "./redirect";
describe("post-login redirect", () => {
  it.each(["javascript:alert(1)","https://attacker.invalid","//attacker.invalid","/\\attacker.invalid",null])("rejects unsafe destination %s",value => expect(safeNextPath(value,"/queue")).toBe("/queue"));
  it("accepts an internal path with a query", () => expect(safeNextPath("/queue?tab=live","/staff")).toBe("/queue?tab=live"));
});
