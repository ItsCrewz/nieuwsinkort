import { test, expect } from "@playwright/test";

// Filterblad (#627): echte Tab/Shift+Tab, Escape, sluitknop en focusherstel, op nieuws en filmpjes, met en zonder reduced motion.
// Fixture-data, externe verzoeken geblokkeerd. Lokaal zonder Playwright-chromium: PW_CHROME=/usr/bin/google-chrome.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "alleen het chromium-project"); });
test.use({ viewport: { width: 390, height: 844 }, launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

const blokkeer = (page) => page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
const binnen = (page) => page.evaluate(() => !!document.activeElement?.closest(".fsheet, [role=dialog]"));
const opener = (page) => page.locator("button.fpill").first();

for (const route of ["#/", "#/dumpert"]) for (const reduced of ["no-preference", "reduce"]) {
  test(`filterblad ${route} (${reduced}): focus blijft binnen, Escape en sluitknop herstellen focus`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced });
    await blokkeer(page);
    await page.goto(route);
    await opener(page).waitFor();
    await opener(page).focus();
    await page.keyboard.press("Enter");
    const dialoog = page.locator("[role=dialog]");
    await expect(dialoog).toBeVisible();
    await expect(page.locator(".fsheet button:not([disabled])").first()).toBeFocused();
    // Tab vooruit en achteruit, ruim voorbij de rand: focus verlaat het blad nooit en komt nooit op een uitgeschakelde knop.
    const aantal = await page.locator(".fsheet button:not([disabled])").count();
    for (let i = 0; i < aantal + 3; i++) {
      await page.keyboard.press("Tab");
      expect(await binnen(page)).toBe(true);
      expect(await page.evaluate(() => document.activeElement.disabled === true)).toBe(false);
    }
    for (let i = 0; i < aantal + 3; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await binnen(page)).toBe(true);
    }
    // Shift+Tab vanaf het eerste element gaat naar het laatste, Tab vanaf het laatste naar het eerste.
    const [eerste, laatste] = await page.evaluate(() => { const l = [...document.querySelectorAll(".fsheet button:not([disabled]), .fsheet [tabindex]:not([tabindex='-1'])")]; return [l[0], l[l.length - 1]].map((e) => e.outerHTML); });
    await page.locator(".fsheet button:not([disabled])").first().focus();
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement.outerHTML)).toBe(laatste);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement.outerHTML)).toBe(eerste);
    // Escape sluit en geeft focus terug aan de opener.
    await page.keyboard.press("Escape");
    await expect(dialoog).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
    // Sluitknop: zelfde herstel.
    await page.keyboard.press("Enter");
    await expect(dialoog).toBeVisible();
    await expect(page.locator(".fsheet button.iconbtn").first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialoog).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
  });
}

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
