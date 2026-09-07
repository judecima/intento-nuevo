import { expect, test } from "@playwright/test";
import { credentialsFor, expectHeading, loginAs } from "./helpers";

const customer = credentialsFor("customer");

test.describe("customer project flow", () => {
  test.skip(!customer, "Set E2E_CUSTOMER_EMAIL and E2E_CUSTOMER_PASSWORD to run customer project E2E.");

  test("customer can start a project picking a board from the modal", async ({ page }) => {
    await loginAs(page, customer!);

    await page.goto("/projects/new");
    await expectHeading(page, "Nuevo proyecto");

    // El tablero se elige en el modal con imagenes, no en una galeria con links.
    await page.getByRole("button", { name: /mm/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Elegir tablero" });
    await expect(dialog).toBeVisible();
    await dialog.locator("button[aria-pressed]").first().click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("button", { name: "Crear proyecto" })).toBeVisible();
    const projectName = `E2E proyecto ${Date.now()}`;
    await page.getByLabel("Nombre").fill(projectName);
    await page.getByRole("button", { name: "Crear proyecto" }).click();

    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/i);
    await expectHeading(page, projectName);
    await expect(page.getByRole("button", { name: "Agregar pieza" })).toBeVisible();
  });
});
