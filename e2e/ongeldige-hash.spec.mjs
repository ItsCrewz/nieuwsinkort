import { test, expect } from "@playwright/test";

test("ongeldige hashes openen het overzicht bij laden en navigeren", async ({ page }) => {
  const fouten = [];
  page.on("pageerror", (fout) => fouten.push(fout.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort("blockedbyclient"));
  await page.goto("#/%");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.goto("#/tech");
  await expect(page).toHaveTitle(/Tech/);
  await page.evaluate(() => { window.location.hash = "#/bericht/%E0%A4"; });
  await expect(page).toHaveTitle("Nieuws in het kort");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  expect(fouten).toEqual([]);
});
