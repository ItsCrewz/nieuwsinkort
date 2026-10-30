import assert from "node:assert/strict";
import { GELIJK, MP4_BYTES, laagsteVariant, naIdle, planVoorladen, segmenten, voerUit, type Hulp, type Plan } from "../src/voorladen";
import type { Video } from "../src/types";

const test = async (naam: string, f: () => void | Promise<void>) => {
  await f();
  console.log("✓", naam);
};
const leeg = (): Plan => ({ thumbs: [], preconnect: [], hlsChunk: false, hls: [], mp4: null });
const video = (embed: string, thumb = "https://img.example/gelijk.jpg"): Video =>
  ({ titel: "test", ai: "", bron: "x", href: "https://x.nl", embed, thumb, populariteit: "", tijd: "" });
const hulp: Hulp = {
  playerFor: (v) => v.embed?.endsWith(".mp4") ? { kind: "mp4", src: v.embed } : v.embed?.endsWith(".m3u8") ? { kind: "hls", src: v.embed } : null,
  viaProxy: (src) => `/proxy?url=${encodeURIComponent(src)}`,
};

await test("lege lijsten en dubbele items over beide tabs", () => {
  assert.deepEqual(planVoorladen([], [], true, hulp), leeg());
  const hls = video("https://media.example/a.m3u8");
  const mp4 = video("https://media.example/a.mp4");
  assert.deepEqual(planVoorladen([hls, mp4], [hls, mp4], false, hulp), {
    thumbs: [hls.thumb], preconnect: ["https://media.example"], hlsChunk: true,
    hls: [hulp.viaProxy(hls.embed!)], mp4: mp4.embed,
  });
  assert.deepEqual(planVoorladen([hls, mp4], [hls, mp4], true, hulp).preconnect, ["https://media.example"]);
});

await test("alleen https-thumbnails en https-mp4, eerste geldige mp4", () => {
  const items = [video("http://media.example/a.mp4", "http://img.example/a"), video("https://media.example/b.mp4", "geen-url"), video("https://media.example/c.mp4", "https://img.example/c")];
  const p = planVoorladen(items, [], false, hulp);
  assert.deepEqual(p.thumbs, ["https://img.example/c"]);
  assert.equal(p.mp4, "https://media.example/b.mp4");
  assert.deepEqual(p.preconnect, ["https://media.example"]);
});

await test("playlist zonder bruikbare variant en segmentlimiet", () => {
  assert.equal(laagsteVariant("#EXT-X-STREAM-INF:BANDWIDTH=10\n#commentaar\n", "https://media.example/"), "");
  assert.equal(laagsteVariant("#EXT-X-STREAM-INF:BANDWIDTH=10\nrelatief.m3u8", "ongeldige basis"), "");
  assert.deepEqual(segmenten("#EXTM3U\n\na.ts\nb.ts\nc.ts", "https://media.example/map/", 1), ["https://media.example/map/a.ts"]);
  assert.deepEqual(segmenten("a.ts\nhttps://media.example/b.ts", "ongeldige basis"), []);
});

const origineel = Object.getOwnPropertyDescriptors(globalThis);
const installeer = (naam: string, waarde: unknown) => Object.defineProperty(globalThis, naam, { value: waarde, configurable: true, writable: true });
const herstel = (namen: string[]) => {
  for (const naam of namen) {
    if (origineel[naam]) Object.defineProperty(globalThis, naam, origineel[naam]);
    else Reflect.deleteProperty(globalThis, naam);
  }
};
const wacht = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

try {
  const links: { rel: string; href: string; crossOrigin: string }[] = [];
  const afbeeldingen: { src: string; decoding: string; referrerPolicy: string; fetchPriority: string; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
  installeer("document", {
    head: { appendChild: (link: typeof links[number]) => links.push(link) },
    createElement: () => ({ rel: "", href: "", crossOrigin: "niet-ingesteld" }),
  });
  installeer("Image", class {
    src = ""; decoding = ""; referrerPolicy = ""; fetchPriority = "";
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor() { afbeeldingen.push(this); }
  });
  installeer("location", { href: "https://site.example/" });

  await test("lege uitvoering doet niets", () => {
    installeer("fetch", () => { throw new Error("onverwachte fetch"); });
    voerUit(leeg());
    assert.equal(links.length, 0);
    assert.equal(afbeeldingen.length, 0);
  });

  await test("mobiele data en Save-Data beperken het bestaande plan niet", async () => {
    installeer("navigator", { onLine: true, connection: { type: "cellular", effectiveType: "2g", saveData: true } });
    const verzoeken: { url: string; opties: RequestInit }[] = [];
    installeer("fetch", async (url: string, opties: RequestInit) => {
      verzoeken.push({ url, opties });
      return { body: null };
    });
    const v = video("https://mobiel.example/a.mp4", "https://img.example/mobiel.jpg");
    const p = planVoorladen([v], [], false, hulp);
    voerUit(p);
    await wacht();
    assert.deepEqual(links, [{ rel: "preconnect", href: "https://mobiel.example", crossOrigin: "" }]);
    assert.equal(afbeeldingen[0].src, v.thumb);
    assert.equal(afbeeldingen[0].decoding, "async");
    assert.equal(afbeeldingen[0].referrerPolicy, "no-referrer");
    assert.equal(afbeeldingen[0].fetchPriority, "low");
    assert.equal(verzoeken.length, 1);
    assert.equal(verzoeken[0].url, v.embed);
    assert.deepEqual(verzoeken[0].opties, { credentials: "omit", priority: "low", headers: { Range: `bytes=0-${MP4_BYTES - 1}` } });
    afbeeldingen[0].onload!();
    voerUit(p);
    await wacht();
    assert.equal(links.length, 1);
    assert.equal(afbeeldingen.length, 1);
    assert.equal(verzoeken.length, 1);
  });

  await test("offline-fouten worden opgevangen en niet opnieuw geprobeerd", async () => {
    installeer("navigator", { onLine: false });
    const verzoeken: string[] = [];
    installeer("fetch", async (url: string) => { verzoeken.push(url); throw new Error("offline"); });
    const p = { ...leeg(), hls: ["/offline.m3u8"], mp4: "https://offline.example/a.mp4" };
    voerUit(p);
    await wacht();
    voerUit(p);
    await wacht();
    assert.deepEqual(verzoeken, ["/offline.m3u8", "https://offline.example/a.mp4"]);
  });

  await test("HLS haalt laagste variant en hooguit twee segmenten op", async () => {
    const verzoeken: string[] = [];
    const optiesLijst: RequestInit[] = [];
    installeer("fetch", async (url: string, opties: RequestInit) => {
      verzoeken.push(url);
      optiesLijst.push(opties);
      const txt = url === "/master-test.m3u8" ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500\nhoog.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlaag.m3u8" : "#EXTM3U\n1.ts\n2.ts\n3.ts";
      return { ok: true, text: async () => txt, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    voerUit({ ...leeg(), hls: ["/master-test.m3u8"] });
    await wacht();
    assert.deepEqual(verzoeken, ["/master-test.m3u8", "https://site.example/laag.m3u8", "https://site.example/1.ts", "https://site.example/2.ts"]);
    assert.deepEqual(optiesLijst, verzoeken.map(() => ({ credentials: "omit", priority: "low" })));
  });

  await test("mp4-stream stopt bij de bytegrens", async () => {
    let gelezen = 0;
    let gestopt = false;
    installeer("fetch", async () => ({ body: { getReader: () => ({
      read: async () => { gelezen++; return { done: false, value: new Uint8Array(MP4_BYTES / 2) }; },
      cancel: async () => { gestopt = true; },
    }) } }));
    voerUit({ ...leeg(), mp4: "https://grens.example/a.mp4" });
    await wacht();
    assert.equal(gelezen, 2);
    assert.equal(gestopt, true);
  });

  await test("hooguit drie taken tegelijk, ook na afbeeldingsfout", async () => {
    const begin = afbeeldingen.length;
    voerUit({ ...leeg(), thumbs: Array.from({ length: GELIJK + 2 }, (_, i) => `https://pool.example/${i}.jpg`) });
    assert.equal(afbeeldingen.length - begin, GELIJK);
    afbeeldingen[begin].onerror!();
    await wacht();
    assert.equal(afbeeldingen.length - begin, GELIJK + 1);
    afbeeldingen[begin + 1].onload!();
    await wacht();
    assert.equal(afbeeldingen.length - begin, GELIJK + 2);
    afbeeldingen.slice(begin + 2).forEach((img) => img.onload!());
    await wacht();
  });

  await test("naIdle wacht op load, idle en zichtbaarheid en kan annuleren", () => {
    const venster = new EventTarget();
    const doc = new EventTarget() as EventTarget & { readyState: string; visibilityState: string };
    doc.readyState = "loading";
    doc.visibilityState = "hidden";
    const callbacks: (() => void)[] = [];
    Object.assign(venster, { requestIdleCallback: (fn: () => void, opties: { timeout: number }) => { assert.equal(opties.timeout, 5000); callbacks.push(fn); } });
    installeer("window", venster);
    installeer("document", doc);
    let uitgevoerd = 0;
    const annuleer = naIdle(() => uitgevoerd++);
    assert.equal(callbacks.length, 0);
    venster.dispatchEvent(new Event("load"));
    assert.equal(callbacks.length, 1);
    callbacks.shift()!();
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(callbacks.length, 0);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(callbacks.length, 1);
    callbacks.shift()!();
    assert.equal(uitgevoerd, 1);
    annuleer();

    const stop = naIdle(() => uitgevoerd++);
    stop();
    venster.dispatchEvent(new Event("load"));
    assert.equal(callbacks.length, 0);
    doc.readyState = "complete";
    const stopIdle = naIdle(() => uitgevoerd++);
    stopIdle();
    callbacks.shift()!();
    assert.equal(uitgevoerd, 1);
    doc.visibilityState = "hidden";
    const stopVerborgen = naIdle(() => uitgevoerd++);
    callbacks.shift()!();
    stopVerborgen();
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(callbacks.length, 0);
  });

  await test("naIdle gebruikt een timer zonder requestIdleCallback", () => {
    installeer("window", new EventTarget());
    installeer("document", { readyState: "complete", visibilityState: "visible" });
    let callback: (() => void) | undefined;
    installeer("setTimeout", (fn: () => void, ms: number) => { assert.equal(ms, 1500); callback = fn; return 1; });
    let uitgevoerd = 0;
    naIdle(() => uitgevoerd++);
    assert.equal(uitgevoerd, 0);
    callback!();
    assert.equal(uitgevoerd, 1);
  });
} finally {
  herstel(["document", "Image", "location", "navigator", "fetch", "window", "setTimeout"]);
}