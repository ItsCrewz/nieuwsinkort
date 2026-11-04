import { test, expect } from "@playwright/test";

test("zoeken op een smal scherm zonder extra verzoeken of opslag", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const opslag = await page.evaluate(() => ({ ...localStorage }));
  const verzoeken = [];
  page.on("request", (request) => { if (["fetch", "xhr"].includes(request.resourceType())) verzoeken.push(request.url()); });
  const knop = page.getByRole("button", { name: "Zoek", exact: true });
  await knop.click();
  const invoer = page.getByRole("searchbox", { name: "Zoek in het nieuws" });
  await expect(invoer).toBeFocused();
  expect(await invoer.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await invoer.fill("onvindbarezoekterm506");
  await expect(page.locator("[aria-live=polite]").filter({ hasText: "0 resultaten" })).toBeAttached();
  await expect(page.getByText("Geen berichten gevonden voor", { exact: false })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await invoer.press("Escape");
  await expect(invoer).toBeHidden();
  await expect(knop).toBeFocused();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(opslag);
  expect(verzoeken).toEqual([]);
});
