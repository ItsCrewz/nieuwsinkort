// #1113: vastgelopen videoverzoeken geven de gedeelde pool weer vrij.
import assert from "node:assert/strict";
import { GELIJK, NETWERK_TIMEOUT, voerUit, type Plan } from "../../src/voorladen";

const g = globalThis as unknown as Record<string, unknown>;
const echteTimeout = globalThis.setTimeout;
const echteClear = globalThis.clearTimeout;
const echteFetch = globalThis.fetch;
const timers: { f: () => void; ms: number; weg: boolean }[] = [];
const wacht = () => new Promise<void>((r) => echteTimeout(r, 0));
const plan = (hls: string[], mp4: string | null = null): Plan => ({ thumbs: [], preconnect: [], hlsChunk: false, hls, mp4 });
g.setTimeout = (f: () => void, ms: number) => { const t = { f, ms, weg: false }; timers.push(t); return t; };
g.clearTimeout = (t: { weg: boolean }) => { t.weg = true; };
g.location = { href: "https://site.example/" };

try {
  for (const fase of ["fetch", "body"]) {
    const signalen: AbortSignal[] = [];
    const verzoeken: string[] = [];
    let afgebroken = 0;
    const lateRespons: ((r: unknown) => void)[] = [];
    g.fetch = (url: string, opties: RequestInit) => {
      verzoeken.push(url);
      signalen.push(opties.signal!);
      if (url.includes("volgende")) return Promise.resolve({ ok: true, body: null });
      if (fase === "fetch") return new Promise((resolve) => { lateRespons.push(resolve); });
      return Promise.resolve({ ok: true, headers: new Headers(), body: { getReader: () => ({
        read: () => new Promise(() => {}), cancel: async () => { afgebroken++; },
      }) } });
    };
    const begin = timers.length;
    voerUit(plan([`https://site.example/${fase}-1.m3u8`, `https://site.example/${fase}-2.m3u8`], `https://site.example/${fase}.mp4`));
    voerUit(plan([], `https://site.example/${fase}-volgende.mp4`));
    await wacht();
    assert.equal(verzoeken.length, GELIJK);
    assert.ok(timers.slice(begin).every((t) => t.ms === NETWERK_TIMEOUT));
    timers[begin].f();
    await wacht();
    assert.equal(signalen[0].aborted, true);
    assert.equal(verzoeken.length, GELIJK + 1);
    if (fase === "fetch") {
      lateRespons[0]({ body: { cancel: async () => { afgebroken++; } } });
      await wacht();
    }
    assert.equal(afgebroken, 1);
    timers.slice(begin + 1, begin + GELIJK).forEach((t) => t.f());
    await wacht();
  }
} finally {
  g.setTimeout = echteTimeout;
  g.clearTimeout = echteClear;
  g.fetch = echteFetch;
}
console.log("✓ vastgelopen videoverzoeken geven de pool vrij");
