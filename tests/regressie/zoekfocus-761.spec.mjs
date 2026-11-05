import { test, expect } from "@playwright/test";

for (const verdwenen of [false, true]) test(`zoekresultaat behoudt focus bij terugkeer (verdwenen: ${verdwenen})`, async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  const eerste = page.locator(".nc-title a").first();
  await expect(eerste).toBeVisible();
  const titel = (await eerste.textContent()).trim();
  const href = await eerste.getAttribute("href");
  const knop = page.getByRole("button", { name: "Zoeken", exact: true });
  await knop.focus();
  await page.keyboard.press("Enter");
  const invoer = page.getByRole("searchbox", { name: "Zoek in het nieuws" });
  await expect(invoer).toBeFocused();
  await invoer.fill(titel);
  const resultaat = page.locator(".nc-title a").filter({ hasText: titel }).first();
  await resultaat.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Terug naar het nieuws" })).toBeVisible();
  if (verdwenen) await page.evaluate(() => { location.hash = "#/tech"; });
  else await page.getByRole("button", { name: "Terug naar het nieuws" }).press("Enter");
  await expect(invoer).toHaveValue(titel);
  if (verdwenen) {
    await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
    await expect(knop).toBeFocused();
  } else await expect(page.locator(`.nc-title a[href="${href}"]`)).toBeFocused();
  await invoer.focus();
  await invoer.press("Escape");
  await expect(knop).toBeFocused();
});
