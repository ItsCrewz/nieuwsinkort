// #1314: mislukte /meer-aanvraag is te onderscheiden van "geen verdieping" en is te herhalen; oude fouten lekken niet naar een ander bericht.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { useMeer } from "../src/meer";

const g = globalThis as any;
g.MessageChannel = class {
  port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.IS_REACT_ACT_ENVIRONMENT = true;
g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {} });
const { createRoot } = await import("react-dom/client");
const noop = () => {};
const container = () =>
  ({ nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", addEventListener: noop, removeEventListener: noop, ownerDocument: { addEventListener: noop, removeEventListener: noop } }) as unknown as Element;

let n = 0;
const t = async (naam: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log("✓", naam); };

const antwoorden: Record<string, Array<() => Promise<any>>> = {};
g.fetch = (u: string) => {
  const k = decodeURIComponent(u.split("k=")[1]);
  const f = antwoorden[k].shift()!;
  return f();
};
const ok = (v: unknown) => () => Promise.resolve({ ok: true, status: 200, json: async () => v });
const status = (s: number) => () => Promise.resolve({ ok: false, status: s, json: async () => ({}) });
const netwerk = () => () => Promise.reject(new Error("net"));

function render() {
  const result = { current: undefined as any };
  const C = ({ item }: { item: any }) => { result.current = useMeer(item); return null; };
  const root = createRoot(container());
  return { result, root, zet: (item: any) => act(async () => root.render(createElement(C, { item }))) };
}

await t("netwerkfout en 503 geven fout; opnieuw haalt de verdieping op", async () => {
  for (const [k, fail] of [["fout-net", netwerk()], ["fout-503", status(503)]] as const) {
    antwoorden[k] = [fail, ok({ uitleg: ["ok"] })];
    const { result, root, zet } = render();
    await zet({ meer: k });
    assert.equal(result.current.fout, true, k);
    assert.equal(result.current.laden, false);
    await act(async () => result.current.opnieuw());
    assert.equal(result.current.fout, false, k);
    assert.equal(result.current.meer?.uitleg?.[0], "ok");
    await act(async () => root.unmount());
  }
});

await t("ongeldige JSON is een fout", async () => {
  antwoorden["fout-json"] = [() => Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error("x"); } })];
  const { result, root, zet } = render();
  await zet({ meer: "fout-json" });
  assert.equal(result.current.fout, true);
  await act(async () => root.unmount());
});

await t("404 betekent geen verdieping en geen melding", async () => {
  antwoorden["geen-404"] = [status(404)];
  const { result, root, zet } = render();
  await zet({ meer: "geen-404" });
  assert.deepEqual([result.current.fout, result.current.laden, result.current.meer], [false, false, null]);
  await act(async () => root.unmount());
});

await t("wisselen of sluiten: oude fout verschijnt niet bij het nieuwe bericht", async () => {
  antwoorden["wis-a"] = [netwerk()];
  let klaar!: (v: any) => void;
  antwoorden["wis-b"] = [() => new Promise((res) => { klaar = res; })];
  const { result, root, zet } = render();
  await zet({ meer: "wis-a" });
  assert.equal(result.current.fout, true);
  await zet({ meer: "wis-b" });
  assert.deepEqual([result.current.fout, result.current.laden], [false, true]);
  await act(async () => klaar({ ok: true, status: 200, json: async () => ({ uitleg: ["B"] }) }));
  assert.equal(result.current.meer?.uitleg?.[0], "B");
  await zet({ meer: "wis-a" }.meer ? {} : {});
  assert.equal(result.current.fout, false);
  await act(async () => root.unmount());
});

console.log(`${n} tests ok`);
