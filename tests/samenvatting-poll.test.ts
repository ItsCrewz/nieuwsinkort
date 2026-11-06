// Draai: npm run test. haalSamenvatting: sluiten stopt aanvraag en wachttimer; normale vervolgpoging blijft werken.
import assert from "node:assert/strict";
import { haalSamenvatting, svCache } from "../src/samenvattingcache";

const echteFetch = globalThis.fetch, echteTimeout = globalThis.setTimeout, echteClear = globalThis.clearTimeout;
const timers = new Map<number, () => void>();
let tid = 0;
globalThis.setTimeout = ((f: () => void) => { timers.set(++tid, f); return tid; }) as any;
globalThis.clearTimeout = ((i: number) => { timers.delete(i); }) as any;
const json = (o: any) => new Response(JSON.stringify(o));
const tick = () => new Promise<void>((r) => echteTimeout(r, 0));
try {
  // sluiten tijdens de wachttijd: timer weg, geen nieuwe fetch
  svCache.clear();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return json({ ok: false, code: "bezig", fout: "" }); }) as any;
  const ac = new AbortController();
  const p = haalSamenvatting("a", ac.signal);
  const afgewezen = assert.rejects(p, { name: "AbortError" });
  await tick(); await tick();
  assert.equal(calls, 1);
  assert.equal(timers.size, 1, "wachttimer loopt");
  ac.abort();
  await afgewezen;
  assert.equal(timers.size, 0, "timer opgeruimd");
  assert.equal(calls, 1, "geen nieuwe poging");

  // blad open: na 'bezig' volgt een tweede poging
  calls = 0;
  globalThis.fetch = (async () => (++calls === 1 ? json({ ok: false, code: "bezig", fout: "" }) : json({ ok: true, punten: ["x"], bron: "spraak" }))) as any;
  const p2 = haalSamenvatting("b", new AbortController().signal);
  await tick(); await tick();
  assert.equal(timers.size, 1);
  [...timers.values()][0](); timers.clear();
  const r: any = await p2;
  assert.equal(r.ok, true);
  assert.equal(calls, 2);

  // al afgebroken voor de wachttijd (fetch-antwoord komt na sluiten): geen wachttimer
  const ac3 = new AbortController();
  globalThis.fetch = (async () => { ac3.abort(); return json({ ok: false, code: "bezig", fout: "" }); }) as any;
  await assert.rejects(haalSamenvatting("c", ac3.signal), { name: "AbortError" });
  assert.equal(timers.size, 0);

  // vertraagd 'bezig'-antwoord dat pas na sluiten binnenkomt: geen timer, geen vervolgpoging
  svCache.clear();
  calls = 0;
  let lever!: (r: Response) => void;
  globalThis.fetch = ((_u: any, init: any) => { calls++; return new Promise<Response>((ok) => { lever = ok; init.signal.addEventListener("abort", () => {}); }); }) as any;
  const ac4 = new AbortController();
  const p4 = assert.rejects(haalSamenvatting("d", ac4.signal), { name: "AbortError" });
  await tick();
  ac4.abort();
  lever(json({ ok: false, code: "bezig", fout: "" }));
  await p4;
  await tick();
  assert.equal(timers.size, 0, "geen timer na laat antwoord");
  assert.equal(calls, 1, "geen vervolgpoging");

  // blad (hook): sluiten en wisselen annuleren en negeren het verlaten antwoord
  const { act, createElement } = await import("react");
  const g = globalThis as any;
  g.MessageChannel = class {
    port1: any = { onmessage: null };
    port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
  };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {} });
  const { createRoot } = await import("react-dom/client");
  const { useSamenvatting } = await import("../src/usesamenvatting");
  const noop = () => {};
  const root = createRoot({ nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", addEventListener: noop, removeEventListener: noop, ownerDocument: { addEventListener: noop, removeEventListener: noop } } as any);
  const gezien: any[] = [];
  const C = ({ id }: { id: string }) => { gezien.push(useSamenvatting(id).res); return null; };
  svCache.clear();
  const wachtend: { id: string; signal: AbortSignal; lever: (r: Response) => void }[] = [];
  globalThis.fetch = ((_u: any, init: any) => new Promise<Response>((ok) => wachtend.push({ id: JSON.parse(init.body).id, signal: init.signal, lever: ok }))) as any;
  await act(async () => root.render(createElement(C, { id: "x" })));
  assert.equal(wachtend.length, 1);
  await act(async () => root.render(createElement(C, { id: "y" })));
  assert.equal(wachtend[0].signal.aborted, true, "wisselen annuleert vorige aanvraag");
  const voor = gezien.length;
  await act(async () => { wachtend[0].lever(json({ ok: true, punten: ["oud"], bron: "spraak" })); await tick(); });
  assert.ok(!gezien.some((r) => r && r.ok && r.punten[0] === "oud"), "verlaten antwoord genegeerd");
  assert.equal(gezien.length, voor, "geen statusupdate voor verlaten aanvraag");
  await act(async () => root.unmount());
  assert.equal(wachtend[1].signal.aborted, true, "sluiten annuleert aanvraag");
  const na = gezien.length;
  wachtend[1].lever(json({ ok: false, code: "bezig", fout: "" }));
  await tick(); await tick();
  assert.equal(wachtend.length, 2, "geen vervolgpoging na sluiten");
  assert.equal(timers.size, 0);
  assert.equal(gezien.length, na);
} finally {
  globalThis.fetch = echteFetch; globalThis.setTimeout = echteTimeout; globalThis.clearTimeout = echteClear;
}
console.log("samenvatting-poll ok");
