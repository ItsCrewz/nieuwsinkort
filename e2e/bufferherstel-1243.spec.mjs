import { test, expect } from "@playwright/test";

const filmpjes = ["abcdefghijk", "bcdefghijkl"].map((id, i) => ({
  titel: `Testvideo ${i}`, bron: "YouTube", href: `https://www.youtube.com/watch?v=${id}`,
  embed: `https://www.youtube-nocookie.com/embed/${id}`, tijd: "12:00", t: Date.now() - i * 60000,
}));

test("YouTube-bufferbewaking reageert op berichten en bediening", async ({ page }) => {
  await page.addInitScript(() => {
    const nu = performance.now.bind(performance);
    window.bufferTijd = 0;
    performance.now = () => nu() + window.bufferTijd;
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.route(/^https:\/\/www\.youtube-nocookie\.com\/embed\//, (route) => route.fulfill({ contentType: "text/html", body: `<script>
    window.opdrachten = [];
    addEventListener("message", e => { let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.event === "listening") parent.postMessage(JSON.stringify({event:"onReady"}), "*");
      if (d.event === "command") window.opdrachten.push(d.func);
    });
  </script>` }));
  await page.route("**/data.json*", (route) => route.fulfill({ json: { gegenereerd: new Date().toISOString(), datum: "18 november 2026", dag_samenvatting: "", weer: {}, items: [], filmpjes } }));
  await page.goto("/#/filmpjes");
  await page.locator(".vcard-open").first().click();
  const slide = page.locator('.fslide[aria-current="true"]');
  const frame = () => slide.locator("iframe.f-yt").contentFrame();
  const bericht = async (info) => frame().locator("body").evaluate((_, info) => parent.postMessage(JSON.stringify({ event: "infoDelivery", info }), "*"), info);
  const vooruit = async (ms) => { await page.evaluate((n) => { window.bufferTijd += n; }, ms); await page.waitForTimeout(350); };
  const knop = page.getByRole("button", { name: "Video buffert. Hervat afspelen" });
  await expect(slide.locator('iframe[data-yt-ready="true"]')).toBeVisible();
  await bericht({ playerState: 3, currentTime: 1 });
  await expect(slide.locator('iframe[data-yt-status="3"]')).toBeVisible();
  await vooruit(9000);
  await expect(knop).toHaveCount(0);
  await bericht({ currentTime: 2 });
  await page.waitForTimeout(100);
  await vooruit(2000);
  await expect(knop).toHaveCount(0);
  await vooruit(9000);
  await expect(knop).toBeVisible();
  await knop.click();
  await expect(knop).toHaveCount(0);
  await expect.poll(() => frame().locator("body").evaluate(() => window.opdrachten.at(-1))).toBe("playVideo");
  await vooruit(5000);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press(" ");
  await vooruit(11000);
  await expect(knop).toHaveCount(0);
  await page.keyboard.press(" ");
  await vooruit(5000);
  await expect(knop).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => slide.getAttribute("data-i")).toBe("1");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => slide.getAttribute("data-i")).toBe("0");
  await vooruit(5000);
  await expect(knop).toHaveCount(0);
});
