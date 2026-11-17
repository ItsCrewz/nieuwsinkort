import { test, expect } from "@playwright/test";

for (const [naam, width, height] of [["desktop", 1280, 800], ["mobiel", 390, 844]]) {
  test(`herstel en nieuwe artikelen (${naam})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
    await page.goto("#/");
    await expect(page.locator(".nf .nc").nth(3)).toBeAttached();
    const ids = await page.locator(".nf .nc").evaluateAll((kaarten) => kaarten.map((kaart) => kaart.dataset.id));
    await page.evaluate((ids) => sessionStorage.setItem("nieuwsinkort-nieuwspositie:alles", JSON.stringify({ id: ids[2], offset: 0, volgorde: ids.slice(1), nieuw: [] })), ids);
    await page.reload();
    await expect(page.locator(".nf-nieuw")).toContainText("1 nieuw artikel");
    await expect.poll(() => page.locator(".nf").evaluate((feed) => Math.abs(feed.scrollTop - feed.querySelectorAll(".nc")[2].offsetTop))).toBeLessThan(3);
    await page.locator(".nf-nieuw button").first().click();
    await expect(page.locator(".nf-nieuw")).toHaveCount(0);
    await expect.poll(() => page.locator(".nf").evaluate((feed) => feed.scrollTop)).toBeLessThan(3);
  });
}
