import { test, expect } from "@playwright/test";

test("bronlinks melden het nieuwe tabblad bij beide soorten videokaarten", async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.route("**/data.json*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const basis = { bron: "Dumpert", ai: "", thumb: "", tijd: "12:00", t: Date.now() - 60000 };
    data.dumpert = [
      { ...basis, titel: "Afspeelbare video", href: "https://www.dumpert.nl/item/1_test", embed: "https://media.dumpert.nl/video.mp4" },
      { ...basis, titel: "Video bij bron", href: "https://www.dumpert.nl/item/2_test", embed: "" },
    ];
    data.gegenereerd = new Date().toISOString();
    await route.fulfill({ response, json: data });
  });
  await page.goto("/#/dumpert");
  for (const titel of ["Afspeelbare video", "Video bij bron"]) {
    const kaart = page.locator(".vcard").filter({ has: page.getByRole("heading", { name: titel }) });
    const knop = kaart.getByRole("button");
    const link = kaart.getByRole("link", { name: "Open bij bron (nieuw tabblad)" });
    await knop.focus();
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", /https:\/\/www\.dumpert\.nl\/item\//);
  }
});
