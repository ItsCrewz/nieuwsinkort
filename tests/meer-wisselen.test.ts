// #646: verdieping van het vorige artikel mag niet onder een nieuw artikel verschijnen; vertraagde antwoorden blijven bij hun artikel.
import assert from "node:assert/strict";
import { meerVoor, prefetchMeer } from "../src/meer";

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

console.log(`${n} tests ok`);
