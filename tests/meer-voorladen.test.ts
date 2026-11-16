// Speculatief voorladen van /meer bij hover is begrensd (#1035); expliciet openen blijft werken.
import assert from "node:assert/strict";
import { prefetchMeer, voorlaadMeer } from "../src/meer";
import type { Item } from "../src/types";

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", name); };
const item = (k: string) => ({ meer: k } as unknown as Item);
const ok = { uitleg: ["a"] };

let nu = 1e12;
Date.now = () => nu;
const aanvragen: string[] = [];
let open: Array<(r: Response) => void> = [];
let modus: "hang" | "ok" | "fout" = "hang";
(globalThis as any).fetch = (url: string) => {
  aanvragen.push(url);
  if (modus === "fout") return Promise.reject(new Error("net"));
  if (modus === "ok") return Promise.resolve(new Response(JSON.stringify(ok)));
  return new Promise<Response>((res) => { open.push(res); });
};
const leeg = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  await t("20 snelle hovers geven hooguit 1 aanvraag", () => {
    for (let i = 0; i < 20; i++) { voorlaadMeer(item("a" + i)); nu += 10; }
    assert.equal(aanvragen.length, 1);
  });
  await t("nooit meer dan 2 speculatieve aanvragen tegelijk", () => {
    nu += 1000; voorlaadMeer(item("b1"));
    nu += 1000; voorlaadMeer(item("b2"));
    assert.equal(aanvragen.length, 2);
  });
  await t("expliciete opening start ook bij volle speculatieve aanvragen", () => {
    void prefetchMeer(item("open1"));
    assert.equal(aanvragen.length, 3);
  });
  await t("na afronding mag speculatief weer", async () => {
    for (const r of open) r(new Response(JSON.stringify(ok)));
    open = []; await leeg(); await leeg();
    nu += 1000; voorlaadMeer(item("c1"));
    assert.equal(aanvragen.length, 4);
    for (const r of open) r(new Response(JSON.stringify(ok)));
    open = []; await leeg(); await leeg();
  });
  await t("heropenen werkt na een fout", async () => {
    modus = "fout";
    assert.equal(await prefetchMeer(item("f1")), null);
    modus = "ok";
    const voor = aanvragen.length;
    assert.deepEqual(await prefetchMeer(item("f1")), ok);
    assert.equal(aanvragen.length, voor + 1);
  });
  await t("cache blijft op of onder 50 ingangen", async () => {
    modus = "ok";
    for (let i = 0; i < 80; i++) await prefetchMeer(item("w" + i));
    const voor = aanvragen.length;
    await prefetchMeer(item("w79")); // recent: uit cache
    assert.equal(aanvragen.length, voor);
    await prefetchMeer(item("w0")); // oudste: verwijderd, dus opnieuw
    assert.equal(aanvragen.length, voor + 1);
  });
  console.log(`${n} tests ok`);
})();
