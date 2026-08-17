import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export type E2ERole = "customer" | "seller" | "operator" | "admin";

export type E2ECredentials = {
  email: string;
  password: string;
};

loadDotEnvLocal();

export function credentialsFor(role: E2ERole): E2ECredentials | null {
  const prefix = `E2E_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];

  if (!email || !password) return null;
  return { email, password };
}

export async function loginAs(page: Page, credentials: E2ECredentials) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login\?error=/);
  await expect(page.getByRole("link", { name: "Salir" })).toBeVisible();
}

export async function expectHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

function loadDotEnvLocal() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const name = trimmed.slice(0, separatorIndex).trim();
    if (process.env[name]) continue;

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    process.env[name] = rawValue.replace(/^"(.*)"$/, "$1");
  }
}
