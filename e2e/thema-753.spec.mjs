import { test, expect } from "@playwright/test";

const thema = (page) => page.locator("html");

test("zonder opslag volgt het thema het systeem tot een handmatige keuze", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Geblokkeerd", "SecurityError"); } });
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Schakel naar donkere modus" })).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(thema(page)).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Schakel naar lichte modus" }).click();
  await expect(thema(page)).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(thema(page)).toHaveAttribute("data-theme", "light");
});

test("opgeslagen keuze blijft behouden bij een systeemwijziging", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("nieuwsinkort-thema", "dark"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Schakel naar lichte modus" })).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(thema(page)).toHaveAttribute("data-theme", "dark");
});
