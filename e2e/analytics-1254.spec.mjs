import { test, expect } from "@playwright/test";

for (const modus of ["geblokkeerd", "stil"]) {
  test(`opt-out blijft behouden na navigatie en herladen bij opslag ${modus}`, async ({ page }) => {
    await page.addInitScript((m) => {
      Storage.prototype.setItem = function () { if (m === "geblokkeerd") throw new Error("opslag geblokkeerd"); };
      Storage.prototype.getItem = function () { if (m === "geblokkeerd") throw new Error("opslag geblokkeerd"); return null; };
    }, modus);
    await page.goto("/?nietmeten=1");
    await expect(page.getByRole("status")).toContainText("Opslag is geblokkeerd");
    await page.locator('a[href="/over"]').click();
    await expect(page).toHaveURL(/\/over$/);
    await page.reload();
    await page.getByRole("link", { name: "Naar Nieuws in het kort" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => page.evaluate(() => window.name)).toBe("nik_nietmeten=1");
    await page.waitForTimeout(500);
    await expect(page.locator('script[src*="cloudflareinsights.com"], script[data-cf-beacon]')).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(500);
    await expect(page.locator('script[src*="cloudflareinsights.com"], script[data-cf-beacon]')).toHaveCount(0);
  });
}
