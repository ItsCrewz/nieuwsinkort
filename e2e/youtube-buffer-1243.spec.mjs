import { test, expect } from "@playwright/test";

const videos = ["abcdefghijk", "lmnopqrstuv"].map((id, i) => ({
  titel: `Testfilmpje ${i}`, bron: "YouTube", href: `https://www.youtube.com/shorts/${id}`,
  embed: `https://www.youtube-nocookie.com/embed/${id}`, soort: "short", tijd: "12:00", t: Date.now() - i * 60000,
}));

test("lang bufferen, voortgang, pauzeren en wisselen herstellen de hint", async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.request().url().startsWith("https://www.youtube-nocookie.com/embed/")
    ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Testspeler</title>" }) : route.abort());
  await page.route("**/data.json*", (route) => route.fulfill({ json: { gegenereerd: new Date().toISOString(), datum: "19 november 2026", dag_samenvatting: "", weer: {}, items: [], dumpert: [], filmpjes: videos } }));
  await page.clock.install();
  await page.goto("/#/filmpjes");
  await page.locator(".vcard-open").first().click();
  const slide = () => page.locator('.fslide[aria-current="true"]');
  const bericht = async (tijd) => {
    await slide().locator("iframe").evaluate((frame, t) => {
      window.dispatchEvent(new MessageEvent("message", { origin: "https://www.youtube-nocookie.com", source: frame.contentWindow, data: JSON.stringify({ event: "infoDelivery", info: { playerState: 3, currentTime: t } }) }));
    }, tijd);
  };
  const hint = () => slide().getByText("Laden duurt lang. Veeg verder.");
  const wacht = async (ms) => { await page.clock.runFor(ms); };
  await expect(slide().locator("iframe")).toBeVisible();
  await bericht(12);
  await wacht(10250);
  await expect(hint()).toBeVisible();
  await bericht(13);
  await expect(hint()).toHaveCount(0);
  await wacht(10250);
  await expect(hint()).toBeVisible();
  await slide().getByRole("button", { name: "Pauzeren" }).click({ force: true });
  await expect(hint()).toHaveCount(0);
  await slide().getByRole("button", { name: "Afspelen" }).click({ force: true });
  await wacht(9000);
  await expect(hint()).toHaveCount(0);
  await wacht(1500);
  await expect(hint()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(slide()).toHaveAttribute("data-i", "1");
  await expect(hint()).toHaveCount(0);
  await page.keyboard.press("ArrowUp");
  await expect(slide()).toHaveAttribute("data-i", "0");
  await bericht(13);
  await wacht(9000);
  await expect(hint()).toHaveCount(0);
  await wacht(1500);
  await expect(hint()).toBeVisible();
});
