import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Aantallen overtredingen, niet het aantal getroffen elementen.
const baseline = { home: 4, tech: 3, filmpjes: 4, dumpert: 4, artikel: 1 };
const consoleAllowlist = [];

for (const [naam, pad, inhoud] of [
  ["home", "#/", ".nc-title a"],
  ["tech", "#/tech", ".nc-title a"],
  ["filmpjes", "#/filmpjes", ".v-title, .empty"],
  ["dumpert", "#/dumpert", ".v-title, .empty"],
  ["artikel", "#/", ".d-title"],
]) {
  test(naam, async ({ page }) => {
    const fouten = [];
    page.on("pageerror", (fout) => fouten.push(`pageerror: ${fout.message}`));
    page.on("console", (bericht) => {
      if (bericht.type() === "error" && !consoleAllowlist.some((patroon) => patroon.test(bericht.text()))) fouten.push(`console: ${bericht.text()}`);
    });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort("blockedbyclient"));
    await page.goto(pad);
    if (naam === "artikel") await page.locator('.nc-title a').first().click();
    await expect(page.locator(inhoud).first()).toBeVisible();
    const resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const ernstig = resultaat.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    console.log(`${test.info().project.name}/${naam}: ${ernstig.length} serious/critical: ${ernstig.map((v) => v.id).join(", ") || "geen"}`);
    expect(ernstig.length).toBeLessThanOrEqual(baseline[naam]);
    expect(fouten).toEqual([]);
  });
}
