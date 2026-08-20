import { describe, expect, it } from "vitest";
import { getNavigationForRole } from "@/lib/domain/navigation";
import {
  canManagePlatform,
  createOrganizationSchema,
  linkOrganizationMemberSchema,
  organizationDeliveryTimeDaysSchema,
  slugifyOrganizationName,
  updateOrganizationSchema
} from "@/lib/domain/platform";

describe("platform domain", () => {
  it("derives database-safe slugs from organization names", () => {
    expect(slugifyOrganizationName("Mueblería del Sur")).toBe("muebleria-del-sur");
    expect(slugifyOrganizationName("  Taller  #3  ")).toBe("taller-3");
    expect(slugifyOrganizationName("ACME S.A.")).toBe("acme-s-a");
    expect(slugifyOrganizationName("---")).toBe("");
    // el check de la base es ^[a-z0-9]+(?:-[a-z0-9]+)*$
    expect(slugifyOrganizationName("Ñandú 2026")).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("fills the slug from the name when it is not provided", () => {
    const parsed = createOrganizationSchema.parse({ name: "Mueblería del Sur", slug: "" });
    expect(parsed).toEqual({ name: "Mueblería del Sur", slug: "muebleria-del-sur" });
  });

  it("keeps an explicit slug but normalizes it", () => {
    const parsed = createOrganizationSchema.parse({ name: "Taller Uno", slug: "Taller Único" });
    expect(parsed.slug).toBe("taller-unico");
  });

  it("rejects names that cannot produce a valid identifier", () => {
    expect(createOrganizationSchema.safeParse({ name: "-- --", slug: "" }).success).toBe(false);
  });

  it("validates organization delivery time as an integer day count", () => {
    expect(organizationDeliveryTimeDaysSchema.parse("12")).toBe(12);
    expect(organizationDeliveryTimeDaysSchema.safeParse("12.5").success).toBe(false);
    expect(organizationDeliveryTimeDaysSchema.safeParse("0").success).toBe(false);
    expect(organizationDeliveryTimeDaysSchema.safeParse("366").success).toBe(false);
  });

  it("reads organization checkboxes, treating an absent field as unchecked", () => {
    const enabled = updateOrganizationSchema.parse({
      organizationId: "3f4f9a4e-16d4-4d2f-9e0f-1c2f0d5a6b7c",
      name: "Taller Uno",
      slug: "",
      active: "true",
      allowCustomerSignup: "true"
    });
    const disabled = updateOrganizationSchema.parse({
      organizationId: "3f4f9a4e-16d4-4d2f-9e0f-1c2f0d5a6b7c",
      name: "Taller Uno",
      slug: "",
      active: ""
    });

    expect(enabled).toMatchObject({ active: true, allowCustomerSignup: true });
    // El navegador no envia los checkbox desmarcados.
    expect(disabled).toMatchObject({ active: false, allowCustomerSignup: false });
  });

  it("allows linking an existing user without password but validates new ones", () => {
    const existing = linkOrganizationMemberSchema.safeParse({
      organizationId: "3f4f9a4e-16d4-4d2f-9e0f-1c2f0d5a6b7c",
      email: "Persona@Taller.com ",
      fullName: "",
      password: "",
      role: "customer"
    });

    expect(existing.success).toBe(true);
    expect(existing.success && existing.data.email).toBe("persona@taller.com");

    const shortPassword = linkOrganizationMemberSchema.safeParse({
      organizationId: "3f4f9a4e-16d4-4d2f-9e0f-1c2f0d5a6b7c",
      email: "nueva@taller.com",
      fullName: "Nueva Persona",
      password: "corta",
      role: "operator"
    });

    expect(shortPassword.success).toBe(false);
  });

  it("recognizes the platform super user", () => {
    expect(canManagePlatform({ isPlatformAdmin: true })).toBe(true);
    expect(canManagePlatform({ isPlatformAdmin: false })).toBe(false);
    expect(canManagePlatform(null)).toBe(false);
  });
});

describe("platform navigation", () => {
  it("hides the organizations ABM from regular org admins", () => {
    const hrefs = getNavigationForRole("admin").map((item) => item.href);
    expect(hrefs).toContain("/admin/users");
    expect(hrefs).not.toContain("/admin/organizations");
  });

  it("shows the ABM to the super user even without an organization role", () => {
    const hrefs = getNavigationForRole(null, { platformAdmin: true }).map((item) => item.href);
    expect(hrefs).toContain("/admin/organizations");
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/projects");
    expect(hrefs).toContain("/projects/new");
  });

  it("keeps tenant navigation for a super user that is also an org member", () => {
    const hrefs = getNavigationForRole("customer", { platformAdmin: true }).map((item) => item.href);
    expect(hrefs).toContain("/projects");
    expect(hrefs).toContain("/admin/organizations");
  });
});
