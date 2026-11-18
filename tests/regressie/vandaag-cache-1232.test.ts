import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestGet } from "../../functions/vandaag";
import { artikelPad } from "../../src/artikelid";

const echteNu = Date.now, oudeCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
const bron = JSON.parse(readFileSync("tests/fixtures/live-nl-31-10.json", "utf8"))[0];
const item = { kop: bron.kop, cat: bron.cat, bronnen: bron.hrefs.map((href: string) => ({ href })) };
const opslag = new Map<string, Response>();
Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
  match: async (r: Request) => opslag.get(r.url)?.clone(),
  put: async (r: Request, antwoord: Response) => { opslag.set(r.url, antwoord); },
} } });
const wachten: Promise<unknown>[] = [];
const vraag = (gegenereerd: string) => onRequestGet({
  request: new Request("https://nieuwsinkort.nl/vandaag"),
  env: { ASSETS: { fetch: async () => Response.json({ gegenereerd, items: [item] }) } },
  waitUntil: (p) => { wachten.push(p); },
});
const seconden = (r: Response) => {
  const cc = r.headers.get("cache-control")!;
  return Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 0) + Number(/stale-while-revalidate=(\d+)/.exec(cc)?.[1] ?? 0);
};
try {
  for (const [gen, grens] of [["2026-10-24T12:00:00Z", "2026-10-25T05:00:00Z"], ["2027-03-27T12:00:00Z", "2027-03-28T04:00:00Z"]]) {
    opslag.clear();
    const eind = Date.parse(grens), pad = artikelPad(item, gen.slice(0, 10));
    Date.now = () => eind - 360_000;
    let r = await vraag(gen); await Promise.all(wachten.splice(0));
    assert.ok((await r.text()).includes(pad));
    assert.ok(seconden(r) <= 360);
    Date.now = () => eind - 120_000;
    r = await vraag(gen);
    assert.ok((await r.text()).includes(pad));
    assert.ok(seconden(r) <= 120, "cachehit mag niet voorbij 06:00 geldig zijn");
    Date.now = () => eind;
    r = await vraag(gen); await Promise.all(wachten.splice(0));
    assert.ok(!(await r.text()).includes(pad), "verlopen artikellinks verdwijnen om 06:00");
  }
  opslag.clear(); Date.now = () => Date.parse("2026-11-04T12:00:00Z");
  const vers = await vraag("2026-11-04T10:00:00Z"); await Promise.all(wachten.splice(0));
  assert.equal(vers.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=600");
  assert.ok((await vers.text()).includes(artikelPad(item, "2026-11-04")));
} finally {
  Date.now = echteNu;
  if (oudeCaches) Object.defineProperty(globalThis, "caches", oudeCaches); else Reflect.deleteProperty(globalThis, "caches");
}
