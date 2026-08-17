import { describe, expect, it } from "vitest";
import { formatDateOnlyEsAr, formatDateTimeEsAr } from "@/lib/format/dates";

describe("stable Argentina date formatting", () => {
  it("formats date-time strings without Intl runtime differences", () => {
    expect(formatDateTimeEsAr("2026-08-13T20:51:00.000Z")).toBe("13/8/26, 5:51 p. m.");
  });

  it("formats date-only strings without timezone shifts", () => {
    expect(formatDateOnlyEsAr("2026-08-13")).toBe("13/8/26");
  });

  it("formats timestamp dates in Argentina time", () => {
    expect(formatDateOnlyEsAr("2026-08-14T01:30:00.000Z")).toBe("13/8/26");
  });

  it("returns pending or empty labels for missing dates", () => {
    expect(formatDateTimeEsAr(null)).toBe("Pendiente");
    expect(formatDateOnlyEsAr(null)).toBe("");
  });
});
