// Verdieping (/meer) volgt de versie van de nieuwsdata onder een gelijkblijvende sleutel (#1252).
import assert from "node:assert/strict";
import { prefetchMeer, zetMeerVersie } from "../src/meer";
import type { Item } from "../src/types";

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", name); };
const item = (k: string) => ({ meer: k } as unknown as Item);
const antw = (t: string) => new Response(JSON.stringify({ uitleg: [t] }));
const wachtrij: Array<(r: Response | Error) => void> = [];
let aanvragen = 0;
(globalThis as any).fetch = () => { aanvragen++; return new Promise<Response>((res, rej) => wachtrij.push((r) => r instanceof Error ? rej(r) : res(r))); };
const leeg = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  await t("gelijktijdige aanvragen voor dezelfde versie worden gedeeld", async () => {
    zetMeerVersie("v1");
    const a = prefetchMeer(item("s")), b = prefetchMeer(item("s"));
    assert.equal(aanvragen, 1);
    wachtrij.shift()!(antw("oud"));
    assert.deepEqual((await a)?.uitleg, ["oud"]); assert.equal(await b, await a);
    await prefetchMeer(item("s"));
    assert.equal(aanvragen, 1, "zelfde versie: uit cache");
  });
  await t("nieuwe versie met dezelfde sleutel haalt opnieuw op", async () => {
    zetMeerVersie("v2");
    const p = prefetchMeer(item("s"));
    assert.equal(aanvragen, 2);
    wachtrij.shift()!(antw("nieuw"));
    assert.deepEqual((await p)?.uitleg, ["nieuw"]);
    await prefetchMeer(item("s"));
    assert.equal(aanvragen, 2);
  });
  await t("late respons van een oudere versie overschrijft de nieuwe cache niet", async () => {
    zetMeerVersie("v3");
    const oud = prefetchMeer(item("s"));
    zetMeerVersie("v4");
    const nieuw = prefetchMeer(item("s"));
    assert.equal(aanvragen, 4);
    const [rOud, rNieuw] = wachtrij.splice(0, 2);
    rNieuw(antw("v4")); await nieuw;
    rOud(antw("v3")); await oud; await leeg();
    assert.deepEqual((await prefetchMeer(item("s")))?.uitleg, ["v4"]);
    assert.equal(aanvragen, 4);
  });
  await t("een fout blijft opnieuw te proberen en houdt de oude tekst", async () => {
    zetMeerVersie("v5");
    const p = prefetchMeer(item("s"));
    wachtrij.shift()!(new Error("net"));
    assert.deepEqual((await p)?.uitleg, ["v4"], "terugval op oude tekst");
    const q = prefetchMeer(item("s"));
    assert.equal(aanvragen, 6, "nieuwe poging");
    wachtrij.shift()!(antw("v5"));
    assert.deepEqual((await q)?.uitleg, ["v5"]);
  });
  console.log(`${n} tests ok`);
})();
