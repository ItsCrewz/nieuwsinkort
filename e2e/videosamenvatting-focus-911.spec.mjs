import { test, expect } from "@playwright/test";

test("focus blijft in de videosamenvatting en keert terug bij sluiten", async ({ page }) => {
  let beantwoord;
  const wacht = new Promise((resolve) => { beantwoord = resolve; });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.route("**/data.json*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.filmpjes = [
      { titel: "Video met ondertitels", bron: "YouTube", href: "https://www.youtube.com/watch?v=OojWxAiS5ew", embed: "https://www.youtube-nocookie.com/embed/OojWxAiS5ew", tijd: "12:00" },
      { titel: "Volgende video", bron: "YouTube", href: "https://www.youtube.com/watch?v=abcdefghijk", embed: "https://www.youtube-nocookie.com/embed/abcdefghijk", tijd: "12:00" },
    ];
    data.samenvattingen = {};
    await route.fulfill({ response, json: data });
  });
  await page.route("**/samenvatting", async (route) => {
    await wacht;
    await route.fulfill({ json: { ok: false, code: "fout", fout: "Probeer het later" } });
  });
  await page.goto("/#/filmpjes/yt-OojWxAiS5ew");
  const opener = page.getByRole("button", { name: "Samenvatting" }).first();
  // Een muisklik geeft de knop in onder meer Safari niet altijd focus.
  await opener.evaluate((knop) => { document.activeElement.blur(); knop.click(); });
  const sluit = page.getByRole("button", { name: "Sluit samenvatting" });
  await expect(sluit).toBeFocused();
  const hash = new URL(page.url()).hash;
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  expect(new URL(page.url()).hash).toBe(hash);
  await page.keyboard.press("Tab");
  await expect(sluit).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(sluit).toBeFocused();
  beantwoord();
  const opnieuw = page.getByRole("button", { name: "Probeer opnieuw" });
  await expect(opnieuw).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(opnieuw).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sluit).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(opnieuw).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(sluit).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(opnieuw).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(sluit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(opener).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
