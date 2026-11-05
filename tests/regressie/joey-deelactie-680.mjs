import { test, expect } from "@playwright/test";

export function testDeelactie(serveer, artikelid, item) {
  test("oude deelactie wijzigt de melding van een ander artikel niet", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise((resolve, reject) => { (window.deelActies ??= []).push({ resolve, reject }); }) } });
    });
    await serveer(page);
    const data = await (await fetch("http://127.0.0.1:4173/data.json")).json();
    const tweede = data.items.find((i) => artikelid().artikelId(i) !== artikelid().artikelId(item));
    await page.goto(`/#/bericht/${artikelid().artikelId(item)}`);
    const knop = page.getByRole("button", { name: "Deel dit bericht" });
    await knop.click();
    await page.evaluate((id) => { window.location.hash = `#/bericht/${id}`; }, artikelid().artikelId(tweede));
    await expect(page.locator(".d-title")).toHaveText(tweede.kop);
    await knop.click();
    await page.evaluate(() => window.deelActies[1].reject(new Error("geweigerd")));
    await expect(page.getByRole("textbox", { name: "Link om handmatig te kopiëren" })).toBeVisible();
    await page.evaluate(() => window.deelActies[0].resolve());
    await expect(page.getByText("Kopieer handmatig")).toBeVisible();
    await expect(page.getByText("Link gekopieerd")).toHaveCount(0);
    await page.evaluate((id) => { window.location.hash = `#/bericht/${id}`; }, artikelid().artikelId(item));
    await expect(page.locator(".d-title")).toHaveText(item.kop);
    await expect(page.getByRole("textbox", { name: "Link om handmatig te kopiëren" })).toHaveCount(0);
  });
}
