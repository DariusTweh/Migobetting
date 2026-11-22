import { describe, expect, it } from "vitest";
import { localDateKey, offsetDateKey } from "../lib/date-time";

describe("Pacific fixture calendar grouping", () => {
  it("groups UTC kickoffs by the displayed Pacific calendar day", () => {
    expect(localDateKey("2026-03-08T07:30:00Z")).toBe("2026-03-07");
    expect(localDateKey("2026-03-08T08:30:00Z")).toBe("2026-03-08");
  });

  it("moves calendar keys without inheriting the host timezone", () => {
    expect(offsetDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(offsetDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});
