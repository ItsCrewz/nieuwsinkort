import { test, expect } from "@playwright/test";

export function testDelenFocus(serveer, artikelid, item) {
  test("handmatig delen selecteert de link en laat toetsenbordnavigatie toe", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new Error("geweigerd"); } });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("geweigerd"); } } });
    });
    await serveer(page);
    await page.goto(`/#/bericht/${artikelid().artikelId(item)}`);
    const knop = page.getByRole("button", { name: "Deel dit bericht" });
    await knop.focus();
    await page.keyboard.press("Enter");
    const invoer = page.getByRole("textbox", { name: "Link om handmatig te kopiëren" });
    await expect(invoer).toBeFocused();
    await expect(invoer).toHaveAccessibleDescription("Kopieer handmatig met Ctrl+C of Command+C.");
    const waarde = await invoer.inputValue();
    expect(waarde).toBe(`https://nieuwsinkort.nl${artikelid().artikelPad(item, new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" }))}`);
    expect(await invoer.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe(waarde);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Tab");
    await expect(invoer).not.toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(invoer).toBeFocused();
  });

  test("annuleren van delen blijft stil", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("", "AbortError"); } });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("mag niet worden aangeroepen"); } } });
    });
    await serveer(page);
    await page.goto(`/#/bericht/${artikelid().artikelId(item)}`);
    await page.getByRole("button", { name: "Deel dit bericht" }).click();
    await expect(page.locator(".deel-melding")).toBeEmpty();
    await expect(page.getByRole("textbox", { name: "Link om handmatig te kopiëren" })).toHaveCount(0);
  });
}
