import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NETWERK_TIMEOUT, voerUit, type Plan } from "../../src/voorladen";

const origineel = Object.getOwnPropertyDescriptors(globalThis);
const zet = (naam: string, waarde: unknown) => Object.defineProperty(globalThis, naam, { value: waarde, configurable: true, writable: true });
const playlist = readFileSync("tests/regressie/fixtures/voorladen-1114/playlist.m3u8", "utf8");
const plan: Plan = { thumbs: [], preconnect: [], hlsChunk: false, hls: ["https://video.example/1114.m3u8"], mp4: "https://video.example/1114.mp4" };
const timers = new Map<number, () => void>();
const aantallen = new Map<string, number>();
let teller = 0;
let ronde = 0;
const spoel = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

try {
  zet("setTimeout", (fn: () => void, ms: number) => { assert.equal(ms, NETWERK_TIMEOUT); timers.set(++teller, fn); return teller; });
  zet("clearTimeout", (id: number) => timers.delete(id));
  zet("fetch", async (url: string) => {
    aantallen.set(url, (aantallen.get(url) ?? 0) + 1);
    if (ronde === 0) throw new Error("tijdelijke netwerkfout");
    if (ronde === 1) return new Promise<Response>(() => {});
    return new Response(url.endsWith(".m3u8") ? playlist : "videodata", { status: 200 });
  });
  voerUit(plan);
  await spoel();
  ronde = 1;
  voerUit(plan);
  voerUit(plan);
  await spoel();
  assert.equal(aantallen.get(plan.hls[0]), 2);
  assert.equal(aantallen.get(plan.mp4!), 2);
  for (const timeout of [...timers.values()]) timeout();
  await spoel();
  ronde = 2;
  voerUit(plan);
  await spoel();
  voerUit(plan);
  await spoel();
  assert.equal(aantallen.get(plan.hls[0]), 3);
  assert.equal(aantallen.get(plan.mp4!), 3);
  assert.equal(aantallen.get("https://video.example/segment.ts"), 1);
  assert.equal(timers.size, 0);
  console.log("✓ mislukte en afgebroken video-opwarming opnieuw geprobeerd; succes en lopende taken niet herhaald");
} finally {
  for (const naam of ["setTimeout", "clearTimeout", "fetch"]) {
    if (origineel[naam]) Object.defineProperty(globalThis, naam, origineel[naam]);
    else Reflect.deleteProperty(globalThis, naam);
  }
}
