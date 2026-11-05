// Favicon en site-icoon (#597): alle icoonbestanden en het manifest geven 200 met passend Content-Type.
import { test, expect } from "@playwright/test";

const BESTANDEN = [["/favicon.ico", /image\/(x-icon|vnd\.microsoft\.icon)/], ["/favicon.svg", /image\/svg\+xml/], ["/icon-48.png", /image\/png/], ["/icon-96.png", /image\/png/], ["/icon-192.png", /image\/png/], ["/icon-512.png", /image\/png/], ["/icon-maskable-512.png", /image\/png/], ["/apple-touch-icon.png", /image\/png/], ["/manifest.webmanifest", /json/]];
for (const [pad, type] of BESTANDEN) test(`${pad} geeft 200`, async ({ request }) => {
  const r = await request.get(pad, { maxRedirects: 0 });
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toMatch(type);
});
