// Hooks uit src/sources.ts in Node, zonder DOM-bibliotheek: minimale window/container-stubs, fetch en localStorage gemockt.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { buildSources, useCatalog, useFiltered, useSourceFilter } from "../src/sources";
import type { Catalog } from "../src/sources";
import type { Data, Item, Video } from "../src/types";

const g = globalThis as any;
// act() plant taken via MessageChannel; Node's echte ports houden het proces open
g.MessageChannel = class {
  port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.IS_REACT_ACT_ENVIRONMENT = true;
const win = new EventTarget() as EventTarget & { HTMLIFrameElement: unknown };
win.HTMLIFrameElement = class {};
g.window = win;
const listeners = { add: 0, remove: 0 };
const origAdd = win.addEventListener.bind(win);
const origRemove = win.removeEventListener.bind(win);
win.addEventListener = (...a: Parameters<EventTarget["addEventListener"]>) => (a[0] === "storage" && listeners.add++, origAdd(...a));
win.removeEventListener = (...a: Parameters<EventTarget["removeEventListener"]>) => (a[0] === "storage" && listeners.remove++, origRemove(...a));

const opslag = new Map<string, string>();
const fouten = { get: false, set: false };
const storage = {
  getItem: (k: string) => {
    if (fouten.get) throw new Error("geblokkeerd");
    return opslag.has(k) ? opslag.get(k)! : null;
  },
  setItem: (k: string, v: string) => {
    if (fouten.set) throw new Error("vol");
    opslag.set(k, String(v));
  },
  removeItem: (k: string) => void opslag.delete(k),
};
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });

const { createRoot } = await import("react-dom/client");
const noop = () => {};
const container = () =>
  ({ nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", addEventListener: noop, removeEventListener: noop, ownerDocument: { addEventListener: noop, removeEventListener: noop } }) as unknown as Element;

async function renderHook<P, R>(hook: (p: P) => R, props: P) {
  const result = { current: undefined as R, renders: 0 };
  function C({ p }: { p: P }) {
    result.current = hook(p);
    result.renders++;
    return null;
  }
  const root = createRoot(container());
  await act(async () => root.render(createElement(C, { p: props })));
  return {
    result,
    rerender: (p: P) => act(async () => root.render(createElement(C, { p }))),
    unmount: () => act(async () => root.unmount()),
  };
}
const t = async (naam: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
  } catch (e) {
    console.error(`mislukt: ${naam}`);
    throw e;
  }
};

const KEY = "nieuwsinkort-bronnen-uit";
type FetchCall = { url: unknown; init: unknown };
function mockFetch(antwoord: () => Promise<unknown>) {
  const calls: FetchCall[] = [];
  g.fetch = (url: unknown, init: unknown) => (calls.push({ url, init }), antwoord());
  return calls;
}

// useCatalog
await t("useCatalog laadt /bronnen.json zonder cache", async () => {
  const cat: Catalog = { gegenereerd: "2026-10-30", groepen: [{ id: "nl", label: "Nederland", bronnen: [{ id: "nos", naam: "NOS" }] }] };
  const calls = mockFetch(async () => ({ ok: true, json: async () => cat }));
  let eerste: unknown = "niet gerenderd";
  const h = await renderHook(() => {
    const c = useCatalog();
    if (eerste === "niet gerenderd") eerste = c;
    return c;
  }, null);
  assert.equal(eerste, null);
  assert.deepEqual(h.result.current, cat);
  assert.deepEqual(calls, [{ url: "/bronnen.json", init: { cache: "no-cache" } }]);
  await h.rerender(null);
  assert.equal(calls.length, 1);
  await h.unmount();
});
await t("useCatalog valt terug op lege groepen", async () => {
  let jsonGelezen = false;
  const gevallen: [string, () => Promise<unknown>][] = [
    ["HTTP-fout", async () => ({ ok: false, json: async () => ((jsonGelezen = true), { groepen: [{ id: "nl" }] }) })],
    ["geen groepen-array", async () => ({ ok: true, json: async () => ({ groepen: "nl" }) })],
    ["null als JSON", async () => ({ ok: true, json: async () => null })],
    ["ongeldige JSON", async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError("json")) })],
    ["netwerkfout", () => Promise.reject(new TypeError("offline"))],
  ];
  for (const [naam, antwoord] of gevallen) {
    mockFetch(antwoord);
    const h = await renderHook(() => useCatalog(), null);
    assert.deepEqual(h.result.current, { groepen: [] }, naam);
    await h.unmount();
  }
  assert.equal(jsonGelezen, false);
});

// useSourceFilter
await t("useSourceFilter leest opgeslagen strings", async () => {
  opslag.set(KEY, JSON.stringify(["nl|nos", 3, null, "tech|tweakers"]));
  const h = await renderHook(() => useSourceFilter(), null);
  assert.deepEqual([...h.result.current.off], ["nl|nos", "tech|tweakers"]);
  await h.unmount();
});
await t("useSourceFilter negeert ongeldige of onleesbare opslag", async () => {
  for (const waarde of ["{kapot", JSON.stringify({ a: "nl|nos" }), JSON.stringify("nl|nos"), ""]) {
    opslag.set(KEY, waarde);
    const h = await renderHook(() => useSourceFilter(), null);
    assert.equal(h.result.current.off.size, 0, waarde);
    await h.unmount();
  }
  opslag.set(KEY, JSON.stringify(["nl|nos"]));
  fouten.get = true;
  const h = await renderHook(() => useSourceFilter(), null);
  assert.equal(h.result.current.off.size, 0);
  fouten.get = false;
  await h.unmount();
});
await t("useSourceFilter setMany en reset bewaren de keuze", async () => {
  opslag.clear();
  const h = await renderHook(() => useSourceFilter(), null);
  const { setMany, reset } = h.result.current;
  await act(async () => setMany(["nl|nos", "nl|nu"], false));
  assert.deepEqual([...h.result.current.off], ["nl|nos", "nl|nu"]);
  assert.deepEqual(JSON.parse(opslag.get(KEY)!), ["nl|nos", "nl|nu"]);
  await act(async () => setMany(["nl|nos", "nl|bestaatniet"], true));
  assert.deepEqual([...h.result.current.off], ["nl|nu"]);
  assert.deepEqual(JSON.parse(opslag.get(KEY)!), ["nl|nu"]);
  await act(async () => setMany(["nl|nu"], true));
  assert.equal(h.result.current.off.size, 0);
  assert.equal(opslag.has(KEY), false);
  await act(async () => setMany(["tech|tweakers"], false));
  await act(async () => reset());
  assert.equal(h.result.current.off.size, 0);
  assert.equal(opslag.has(KEY), false);
  assert.equal(h.result.current.setMany, setMany);
  assert.equal(h.result.current.reset, reset);
  await h.unmount();
});
await t("useSourceFilter werkt door als opslaan mislukt", async () => {
  opslag.clear();
  fouten.set = true;
  const h = await renderHook(() => useSourceFilter(), null);
  await act(async () => h.result.current.setMany(["nl|nos"], false));
  assert.deepEqual([...h.result.current.off], ["nl|nos"]);
  assert.equal(opslag.has(KEY), false);
  fouten.set = false;
  await h.unmount();
});
await t("useSourceFilter volgt andere tabbladen via storage-events", async () => {
  opslag.clear();
  const voor = { ...listeners };
  const h = await renderHook(() => useSourceFilter(), null);
  assert.equal(listeners.add - voor.add, 1);
  const storageEvent = (key: string | null) => Object.assign(new Event("storage"), { key });
  opslag.set(KEY, JSON.stringify(["haarlem|haarlemsdagblad"]));
  await act(async () => void win.dispatchEvent(storageEvent("andere-sleutel")));
  assert.equal(h.result.current.off.size, 0);
  await act(async () => void win.dispatchEvent(storageEvent(KEY)));
  assert.deepEqual([...h.result.current.off], ["haarlem|haarlemsdagblad"]);
  await h.unmount();
  assert.equal(listeners.remove - voor.remove, 1);
  opslag.clear();
});

// useFiltered
const item = (cat: Item["cat"], bronnen: Item["bronnen"]): Item => ({ cat, kop: "Testbericht", ai: "", samenvatting: "", punten: [], tijd: "12:00", bronnen });
const video = (bron: string, href: string): Video => ({ titel: "Video", ai: "", bron, href, thumb: "", populariteit: "", tijd: "12:00" });
const catalog: Catalog = {
  groepen: [
    { id: "nl", label: "Nederland", bronnen: [{ id: "nos", naam: "NOS", hosts: ["nos.nl"] }, { id: "nu", naam: "NU.nl", hosts: ["nu.nl"] }] },
    { id: "filmpjes", label: "Filmpjes", bronnen: [{ id: "yt", naam: "YouTube", hosts: ["youtube.com"] }] },
    { id: "dumpert", label: "Dumpert", bronnen: [{ id: "dumpert", naam: "Dumpert", hosts: ["dumpert.nl"] }] },
  ],
};
const alleenNos = item("nl", [{ site: "NOS", href: "https://nos.nl/1" }]);
const beide = item("nl", [{ site: "NOS", href: "https://nos.nl/2" }, { site: "NU.nl", href: "https://nu.nl/2" }]);
const alleenNu = item("nl", [{ site: "NU.nl", href: "https://nu.nl/3" }]);
const zonderBron = item("nl", []);
const buitenland = item("buitenland", [{ site: "NOS", href: "https://nos.nl/4" }]);
const data: Data = {
  datum: "2026-10-30",
  dag_samenvatting: "",
  weer: {} as Data["weer"],
  items: [alleenNos, beide, alleenNu, zonderBron, buitenland],
  filmpjes: [video("YouTube", "https://youtube.com/watch?v=1"), video("Nieuwe zender", "https://video.example/1")],
  dumpert: [video("", "https://dumpert.nl/item/1")],
};
const { index } = buildSources(catalog, data);

await t("useFiltered zonder data of zonder uitgezette bronnen", async () => {
  const leeg = await renderHook(() => useFiltered(null, index, new Set(["nl|nos"])), null);
  assert.equal(leeg.result.current, null);
  await leeg.unmount();
  const h = await renderHook(() => useFiltered(data, index, new Set()), null);
  assert.equal(h.result.current?.data, data);
  assert.equal(h.result.current?.hidden, 0);
  await h.unmount();
});
await t("useFiltered verbergt berichten pas als alle bronnen uit staan", async () => {
  const h = await renderHook(() => useFiltered(data, index, new Set(["nl|nos"])), null);
  const r = h.result.current!;
  assert.equal(r.hidden, 2);
  assert.equal(r.data.items.length, 3);
  assert.deepEqual(r.data.items[0].bronnen, [{ site: "NU.nl", href: "https://nu.nl/2" }]);
  assert.notEqual(r.data.items[0], beide);
  assert.equal(beide.bronnen.length, 2);
  assert.equal(r.data.items[1], alleenNu);
  assert.equal(r.data.items[2], zonderBron);
  assert.equal(r.data.filmpjes.length, 2);
  assert.equal(r.data.datum, data.datum);
  await h.unmount();
});
await t("useFiltered filtert filmpjes en Dumpert (lege bron = Dumpert)", async () => {
  const h = await renderHook(() => useFiltered(data, index, new Set(["filmpjes|nieuwezender", "dumpert|dumpert"])), null);
  const r = h.result.current!;
  assert.equal(r.hidden, 2);
  assert.deepEqual(r.data.filmpjes.map((v) => v.bron), ["YouTube"]);
  assert.deepEqual(r.data.dumpert, []);
  assert.equal(r.data.items.length, data.items.length);
  await h.unmount();
});
await t("useFiltered rekent opnieuw alleen bij nieuwe invoer", async () => {
  const off = new Set(["nl|nu"]);
  const h = await renderHook((o: Set<string>) => useFiltered(data, index, o), off);
  const eerst = h.result.current;
  await h.rerender(off);
  assert.equal(h.result.current, eerst);
  await h.rerender(new Set(["nl|nu"]));
  assert.notEqual(h.result.current, eerst);
  assert.deepEqual(h.result.current, eerst);
  await h.unmount();
});

console.log("sources-hooks: tests geslaagd");
