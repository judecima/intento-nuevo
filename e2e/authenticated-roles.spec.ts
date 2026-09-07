import { expect, test } from "@playwright/test";
import { credentialsFor, expectHeading, loginAs } from "./helpers";

const admin = credentialsFor("admin");
const customer = credentialsFor("customer");
const seller = credentialsFor("seller");
const operator = credentialsFor("operator");

test.describe("admin role surface", () => {
  test.skip(!admin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run admin E2E.");

  test("admin can access administration, production and sales surfaces", async ({ page }) => {
    await loginAs(page, admin!);

    await page.goto("/admin/users");
    await expectHeading(page, "Usuarios");
    await expect(page.getByRole("link", { name: "Usuarios" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Maquinas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Auditoria" })).toBeVisible();

    await page.goto("/admin/machines");
    await expectHeading(page, "Maquinas");

    await page.goto("/admin/audit");
    await expectHeading(page, "Auditoria");

    await page.goto("/production");
    await expectHeading(page, "Cola de produccion");

    await page.goto("/sales/orders");
    await expectHeading(page, "Pedidos pendientes");
  });
});

test.describe("customer role surface", () => {
  test.skip(!customer, "Set E2E_CUSTOMER_EMAIL and E2E_CUSTOMER_PASSWORD to run customer E2E.");

  test("customer can access projects and orders without admin navigation", async ({ page }) => {
    await loginAs(page, customer!);

    await page.goto("/projects");
    await expectHeading(page, "Mis proyectos");
    await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Cola de produccion" })).toHaveCount(0);

    await page.goto("/orders");
    await expectHeading(page, "Mis pedidos");
  });
});

test.describe("seller role surface", () => {
  test.skip(!seller, "Set E2E_SELLER_EMAIL and E2E_SELLER_PASSWORD to run seller E2E.");

  test("seller can access review queues and is denied production UI", async ({ page }) => {
    await loginAs(page, seller!);

    await page.goto("/sales/orders");
    await expectHeading(page, "Pedidos pendientes");
    await expect(page.getByRole("link", { name: "Pedidos pendientes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);

    await page.goto("/production");
    await expectHeading(page, "Cola de produccion");
    await expect(page.getByText("No tenes permisos para acceder a produccion.")).toBeVisible();
  });
});

test.describe("operator role surface", () => {
  test.skip(!operator, "Set E2E_OPERATOR_EMAIL and E2E_OPERATOR_PASSWORD to run operator E2E.");

  test("operator can access production queues without sales/admin navigation", async ({ page }) => {
    await loginAs(page, operator!);

    await page.goto("/production");
    await expectHeading(page, "Cola de produccion");
    await expect(page.getByRole("link", { name: "Cola de produccion" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pedidos pendientes" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
  });
});
