import { expect, test } from "@playwright/test";

/**
 * /ui-preview monta el AppShell y los componentes del sistema de diseno sin
 * pedir sesion, asi que sirve de red de seguridad visual aunque no haya
 * credenciales E2E cargadas.
 */
test.describe("ui-preview", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ui-preview");
  });

  test("las columnas fijas acompanan el fondo de una fila resaltada", async ({ page }) => {
    const table = page.locator("table.MuiTable-root").first();
    await expect(table).toBeVisible();

    // MRT pinta las celdas fijas con un ::before casi opaco encima del fondo
    // del td. Si esa regla queda sin sobreescribir, la fila resaltada muestra
    // las columnas fijas en blanco y el texto se pierde.
    for (const rowIndex of [1, 2]) {
      const cells = table.locator("tbody tr").nth(rowIndex).locator("td");
      const count = await cells.count();
      expect(count).toBeGreaterThan(2);

      const colors = await cells.evaluateAll((nodes) =>
        nodes.map((node) => {
          const pinned = node.getAttribute("data-pinned") === "true";
          const styles = window.getComputedStyle(node);
          const before = window.getComputedStyle(node, "::before");
          return { pinned, background: pinned ? before.backgroundColor : styles.backgroundColor };
        })
      );

      expect(colors.some((cell) => cell.pinned)).toBe(true);
      expect(new Set(colors.map((cell) => cell.background)).size).toBe(1);
    }
  });

  test("el selector de tablero abre, filtra y cierra con Escape", async ({ page }) => {
    await page.locator(".board-trigger").first().click();

    const dialog = page.locator(".modal");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".board-card")).toHaveCount(4);

    // El dialogo no debe desbordar su propio alto ni empujar la pagina.
    const overflow = await dialog.evaluate((node) => ({
      horizontal: node.scrollWidth > node.clientWidth,
      bodyHorizontal: document.body.scrollWidth > window.innerWidth
    }));
    expect(overflow.horizontal).toBe(false);
    expect(overflow.bodyHorizontal).toBe(false);

    await page.fill(".board-filters .input", "no-existe-este-tablero");
    await expect(dialog.locator(".board-card")).toHaveCount(0);
    await expect(dialog.locator(".empty-state")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("el recorrido marca una sola etapa en curso", async ({ page }) => {
    const pipeline = page.locator("ol.pipeline").first();
    await expect(pipeline).toBeVisible();
    await expect(pipeline.locator('li[data-state="current"]')).toHaveCount(1);
    await expect(pipeline.locator("li")).toHaveCount(6);
  });
});
