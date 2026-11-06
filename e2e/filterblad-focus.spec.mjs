import { test, expect } from "@playwright/test";

// Filterblad (#623): focus blijft op de bediende knop bij meerdere filterwijzigingen; Escape herstelt focus naar de opener.
// Lokaal zonder Playwright-chromium: PW_CHROME=/usr/bin/google-chrome.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "alleen het chromium-project"); });
test.use({ launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

for (const [naam, hash] of [["nieuws", "#/"], ["video", "#/filmpjes"]]) {
  test(`filterblad houdt focus op de bediende knop (${naam})`, async ({ page }) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
    await page.goto(hash);
    const opener = page.locator(".fpill").first();
    await expect(opener).toBeVisible();
    for (const ronde of [0, 1]) {
      await page.waitForTimeout(500); // net na sluiten pakt de opener een klik niet altijd op
      await opener.click();
      const blad = page.getByRole("dialog", { name: /filter/i });
      await page.waitForTimeout(800); // aanimatie van het blad
      await expect(blad, `ronde ${ronde}`).toBeVisible();
      await expect(page.locator(".iconbtn[aria-label='Sluit filters']")).toBeFocused();
      for (const naam of [/^Laatste uur/, /^Laatste 3 uur/, /^Alles/, /^Vandaag/]) {
        const chip = blad.getByRole("button", { name: naam });
        await chip.click();
        await expect(chip).toBeFocused();
        await expect(chip).toHaveAttribute("aria-pressed", "true");
        await expect(blad).toBeVisible();
      }
      if (ronde === 0) await page.keyboard.press("Escape");
      else await blad.locator(".iconbtn[aria-label='Sluit filters']").click();
      await expect(blad).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
  });
}
