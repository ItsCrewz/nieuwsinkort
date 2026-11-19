import { test, expect } from "@playwright/test";

test("suggesties volgen de zoekscope en zijn met het toetsenbord te kiezen", async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.route("**/data.json", async (route) => {
    const data = await (await route.fetch()).json();
    data.gegenereerd = new Date().toISOString();
    const item = data.items[0];
    data.items = [
      { ...item, kop: "Verkiezingen in Nederland", cat: "nl", tijd: data.gegenereerd },
      { ...item, kop: "Verkiezingen in Frankrijk", cat: "politiek", tijd: data.gegenereerd },
    ];
    await route.fulfill({ json: data });
  });
  await page.goto("#/");
  await page.getByRole("button", { name: "Zoeken", exact: true }).click();
  const invoer = page.getByRole("searchbox", { name: "Zoek in het nieuws" });
  await invoer.fill("verkiezngen nederland");
  const groep = page.getByRole("group", { name: "Zoeksuggesties" });
  const suggestie = groep.getByRole("button", { name: "Verkiezingen nederland" });
  await expect(suggestie).toBeVisible();
  await suggestie.focus();
  await page.keyboard.press("Enter");
  await expect(invoer).toHaveValue("Verkiezingen nederland");
  await expect(invoer).toBeFocused();
  await expect(page.locator(".nc-title").filter({ hasText: "Verkiezingen in Nederland" }).first()).toBeVisible();

  await invoer.fill("verkiezingen frankrjik");
  await expect(groep).toHaveCount(0);
  await page.getByRole("button", { name: "Zoek in alle rubrieken en beschikbare berichten" }).click();
  const verborgen = groep.getByRole("button", { name: "verkiezingen Frankrijk" });
  await expect(verborgen).toBeVisible();
  await verborgen.focus();
  await page.keyboard.press("Enter");
  await expect(invoer).toHaveValue("verkiezingen Frankrijk");
  await expect(invoer).toBeFocused();
  await expect(page.locator(".nc-title").filter({ hasText: "Verkiezingen in Frankrijk" }).first()).toBeVisible();
});
