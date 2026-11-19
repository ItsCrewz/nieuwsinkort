import { test, expect } from "@playwright/test";

for (const ontbreekt of [["IntersectionObserver"], ["ResizeObserver"], ["IntersectionObserver", "ResizeObserver"]]) {
  test(`nieuwskaarten zonder ${ontbreekt.join(" en ")}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.addInitScript((namen) => namen.forEach((naam) => { window[naam] = undefined; }), ontbreekt);
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
    await page.route("**/data.json*", async (route) => {
      const antwoord = await route.fetch();
      const data = await antwoord.json();
      data.gegenereerd = new Date().toISOString();
      data.items = data.items.slice(0, 10).map((item, i) => ({ ...item, t: Date.now() - i * 60000, ai: i === 0 ? (item.ai || item.titel || "Nieuwsbericht").repeat(15) : item.ai }));
      await route.fulfill({ response: antwoord, json: data });
    });
    const fouten = [];
    page.on("pageerror", (fout) => fouten.push(fout.message));
    await page.goto("#/");
    const kaarten = page.locator(".nf .nc");
    await expect(kaarten.nth(1).locator(".nc-in.fit-scroll")).toBeAttached();
    for (const i of [0, 1]) {
      const kaart = kaarten.nth(i).locator(".nc-in");
      await kaart.scrollIntoViewIfNeeded();
      await expect(kaart.locator(".nc-title")).toBeVisible();
      await expect(kaart).toHaveCSS("overflow-y", "auto");
      expect(await kaart.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    expect(fouten).toEqual([]);
  });
}
