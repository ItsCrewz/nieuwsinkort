import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "View Transitions in Chromium");
  await page.addInitScript(() => {
    window.overgangen = 0;
    const start = document.startViewTransition?.bind(document);
    if (start) document.startViewTransition = (...args) => { window.overgangen++; return start(...args); };
  });
});

test("artikel openen en sluiten gebruikt overgangen", async ({ page }) => {
  await page.goto("#/");
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".detail .d-title")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.overgangen)).toBe(1);
  await page.locator(".detail .back").click();
  await expect(page.locator(".detail")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.overgangen)).toBe(2);
});

test("verminderde beweging navigeert zonder overgang", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("#/");
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".detail .d-title")).toBeVisible();
  await page.locator(".detail .back").click();
  await expect(page.locator(".detail")).toHaveCount(0);
  expect(await page.evaluate(() => window.overgangen)).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().duration > 0.01).length)).toBe(0);
});

test("zonder View Transition krijgt de lijst bij sluiten parallax", async ({ page }) => {
  await page.addInitScript(() => {
    document.startViewTransition = undefined;
    window.parallax = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, opties) {
      if (this.matches(".nf, main.wrap") && JSON.stringify(frames).includes("-24px")) window.parallax++;
      return animate.call(this, frames, opties);
    };
  });
  await page.goto("#/");
  await page.locator(".nc-title a").first().click();
  await expect(page.locator(".detail")).toBeVisible();
  await page.locator(".detail .back").click();
  await expect.poll(() => page.evaluate(() => window.parallax)).toBe(1);
});
