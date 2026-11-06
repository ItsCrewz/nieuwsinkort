// #646: verdieping van het vorige artikel mag niet onder een nieuw artikel verschijnen; vertraagde antwoorden blijven bij hun artikel.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { meerVoor, prefetchMeer, useMeer } from "../src/meer";

const g = globalThis as any;
// act() plant taken via MessageChannel; Node's echte ports houden het proces open
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
const uitleg = (x: string) => ({ uitleg: [x] }) as any;

await t("state van een ander item geeft laden, nooit de oude inhoud", () => {
  const st = { k: "a", meer: uitleg("A"), laden: false };
  assert.deepEqual(meerVoor(st, "a"), { meer: st.meer, laden: false });
  assert.deepEqual(meerVoor(st, "b"), { meer: null, laden: true });
});

await t("item zonder verdieping toont niets, ook met oude state", () => {
  assert.deepEqual(meerVoor({ k: "a", meer: uitleg("A"), laden: false }, undefined), { meer: null, laden: false });
});

await t("omgekeerd binnenkomende antwoorden blijven bij hun sleutel", async () => {
  const wacht: Record<string, (v: any) => void> = {};
  (globalThis as any).fetch = (u: string) => new Promise((res) => { wacht[decodeURIComponent(u.split("k=")[1])] = (v) => res({ ok: true, json: async () => v }); });
  const pa = prefetchMeer({ meer: "wissel-a" } as any);
  const pb = prefetchMeer({ meer: "wissel-b" } as any);
  wacht["wissel-b"](uitleg("B"));
  wacht["wissel-a"](uitleg("A"));
  const [a, b] = [await pa, await pb];
  assert.equal(a?.uitleg?.[0], "A");
  assert.equal(b?.uitleg?.[0], "B");
  assert.equal(meerVoor({ k: "wissel-a", meer: a, laden: false }, "wissel-b").laden, true);
});

await t("useMeer: wisselen van artikel met vertraagde antwoorden toont nooit de verdieping van het vorige", async () => {
  const wacht: Record<string, (v: any) => void> = {};
  g.fetch = (u: string) => new Promise((res) => { wacht[decodeURIComponent(u.split("k=")[1])] = (v) => res({ ok: true, json: async () => v }); });
  const result = { current: undefined as any };
  const log: string[] = [];
  function C({ item }: { item: any }) {
    result.current = useMeer(item);
    log.push(`${item.meer ?? "-"}:${result.current.laden ? "laden" : result.current.meer?.uitleg?.[0] ?? "leeg"}`);
    return null;
  }
  const root = createRoot(container());
  const A = { meer: "hook-a" } as any, B = { meer: "hook-b" } as any, Z = {} as any;
  await act(async () => root.render(createElement(C, { item: A })));
  await act(async () => root.render(createElement(C, { item: B })));
  await act(async () => wacht["hook-b"](uitleg("B")));
  assert.equal(result.current.meer?.uitleg?.[0], "B");
  await act(async () => wacht["hook-a"](uitleg("A"))); // vertraagd antwoord van het vorige artikel
  assert.equal(result.current.meer?.uitleg?.[0], "B");
  await act(async () => root.render(createElement(C, { item: Z })));
  assert.deepEqual(result.current, { meer: null, laden: false });
  // geen enkele render van een ander artikel toont andermans inhoud
  assert.ok(!log.some((l) => l.startsWith("hook-b:A") || l.startsWith("hook-a:B") || l.startsWith("-:A") || l.startsWith("-:B")), log.join(" "));
  await act(async () => root.unmount());
});

console.log(`${n} tests ok`);
