import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NETWERK_TIMEOUT, voerUit, type Plan } from "../../src/voorladen";

const origineel = Object.getOwnPropertyDescriptors(globalThis);
const zet = (naam: string, waarde: unknown) => Object.defineProperty(globalThis, naam, { value: waarde, configurable: true, writable: true });
const timers = new Map<number, () => void>();
let teller = 0;
const verzoeken: { url: string; signal: AbortSignal }[] = [];
let annuleerLezer = 0;
const nooit = new Promise<never>(() => {});
const master = readFileSync("tests/regressie/fixtures/voorladen-723/master.m3u8", "utf8");
const leeg: Plan = { thumbs: [], preconnect: [], hlsChunk: false, hls: [], mp4: null };
const doorspoelen = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

try {
  zet("location", { href: "https://site.example/" });
  zet("setTimeout", (fn: () => void, ms: number) => { assert.equal(ms, NETWERK_TIMEOUT); timers.set(++teller, fn); return teller; });
  zet("clearTimeout", (id: number) => timers.delete(id));
  zet("fetch", async (url: string, opties: RequestInit) => {
    verzoeken.push({ url, signal: opties.signal! });
    if (url === "/hang-723.m3u8") return nooit;
    if (url === "/master-723.m3u8") return { ok: true, text: async () => master };
    if (url.endsWith("laag.m3u8")) return { ok: true, text: () => nooit };
    if (url.endsWith("video.mp4")) return { body: { getReader: () => ({ read: () => nooit, cancel: async () => { annuleerLezer++; } }) } };
    if (url === "/segment-723.m3u8") return { ok: true, text: async () => "#EXTM3U\nvideo.ts" };
    if (url.endsWith("video.ts")) return { arrayBuffer: () => nooit };
    return { ok: true, text: async () => "#EXTM3U" };
  });
  voerUit({ ...leeg, hls: ["/master-723.m3u8", "/segment-723.m3u8", "/hang-723.m3u8", "/volgende-723.m3u8"], mp4: "https://site.example/video.mp4" });
  await doorspoelen();
  assert.equal(verzoeken.length, 5); // drie taken: master, variant, playlist en segment
  assert.equal(timers.size, 3);
  const eerste = [...timers.values()][0];
  eerste();
  await doorspoelen();
  assert.equal(verzoeken[0].signal.aborted, true);
  assert.ok(verzoeken.some((v) => v.url === "/volgende-723.m3u8"));
  await doorspoelen();
  assert.ok(verzoeken.some((v) => v.url.endsWith("video.mp4")));
  for (const fn of [...timers.values()]) fn();
  await doorspoelen();
  assert.equal(annuleerLezer, 1);
  assert.ok(verzoeken.find((v) => v.url.endsWith("video.ts"))!.signal.aborted);
  assert.ok(verzoeken.find((v) => v.url === "/hang-723.m3u8")!.signal.aborted);
  assert.equal(timers.size, 0);
  console.log("✓ netwerkvoorladen geeft vastgelopen plaatsen vrij en annuleert fetches en lezers");
} finally {
  for (const naam of ["location", "setTimeout", "clearTimeout", "fetch"]) {
    if (origineel[naam]) Object.defineProperty(globalThis, naam, origineel[naam]);
    else Reflect.deleteProperty(globalThis, naam);
  }
}
