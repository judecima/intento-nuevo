import { describe, expect, it } from "vitest";
import { getNavigationForRole } from "@/lib/domain/navigation";
import { getDefaultRouteForRole, hasAnyRole, isOrganizationRole } from "@/lib/domain/roles";

describe("organization roles", () => {
  it("validates known roles", () => {
    expect(isOrganizationRole("customer")).toBe(true);
    expect(isOrganizationRole("seller")).toBe(true);
    expect(isOrganizationRole("operator")).toBe(true);
    expect(isOrganizationRole("admin")).toBe(true);
    expect(isOrganizationRole("owner")).toBe(false);
  });

  it("checks allowed roles without granting anonymous access", () => {
    expect(hasAnyRole("seller", ["seller", "admin"])).toBe(true);
    expect(hasAnyRole("customer", ["seller", "admin"])).toBe(false);
    expect(hasAnyRole(null, ["admin"])).toBe(false);
  });

  it("keeps operator navigation scoped to production", () => {
    const hrefs = getNavigationForRole("operator").map((item) => item.href);

    expect(hrefs).toContain("/production");
    expect(hrefs).not.toContain("/admin/users");
    expect(hrefs).not.toContain("/sales/orders");
  });

  it("resolves default homes by role", () => {
    expect(getDefaultRouteForRole("seller")).toBe("/sales/orders");
    expect(getDefaultRouteForRole("operator")).toBe("/production");
    expect(getDefaultRouteForRole("admin")).toBe("/admin/users");
    expect(getDefaultRouteForRole("customer")).toBe("/dashboard");
  });
});
