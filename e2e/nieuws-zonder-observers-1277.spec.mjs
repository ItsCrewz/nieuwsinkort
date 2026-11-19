import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const voorbeeld = JSON.parse(readFileSync("tests/regressie/fixtures/nieuws-676.json", "utf8"));
for (const ontbreekt of [["IntersectionObserver"], ["ResizeObserver"], ["IntersectionObserver", "ResizeObserver"]]) {
  test(`nieuwskaarten zonder ${ontbreekt.join(" en ")}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.addInitScript((namen) => { for (const naam of namen) window[naam] = undefined; }, ontbreekt);
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
    await page.route("**/data.json*", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.gegenereerd = new Date().toISOString();
      data.items = Array.from({ length: 12 }, (_, i) => ({ ...voorbeeld, t: Date.now() - i * 1000, kop: `${voorbeeld.kop} ${i}`, bronnen: [{ ...voorbeeld.bronnen[0], href: `${voorbeeld.bronnen[0].href}?kaart=${i}` }], ai: i % 2 ? "Kort nieuwsbericht." : voorbeeld.samenvatting, beeld: undefined, beelden: [] }));
      await route.fulfill({ response, json: data });
    });
    const fouten = [];
    page.on("pageerror", (fout) => fouten.push(fout.message));
    await page.goto("#/");
    const kaarten = page.locator(".nf .nc");
    await expect(kaarten).toHaveCount(12);
    await expect(kaarten.nth(0).locator(".nc-title")).toBeVisible();
    expect(await kaarten.nth(10).locator(".nc-in").count()).toBe(0);
    for (const i of [0, 1, 8]) {
      await kaarten.nth(i).scrollIntoViewIfNeeded();
      const inhoud = kaarten.nth(i).locator(".nc-in");
      await expect(inhoud.locator(".nc-title")).toBeVisible();
      await expect.poll(() => inhoud.evaluate((el) => el.scrollHeight <= el.clientHeight + 2 || el.classList.contains("fit-scroll"))).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 480 });
    const inhoud = kaarten.nth(8).locator(".nc-in");
    await expect.poll(() => inhoud.evaluate((el) => el.scrollHeight <= el.clientHeight + 2 || el.classList.contains("fit-scroll"))).toBe(true);
    expect(fouten).toEqual([]);
  });
}
