import assert from "node:assert/strict";
import { rooktest } from "../scripts/rooktest-live.mjs";

const koppen = Array.from({ length: 10 }, (_, i) => `<li><a href="/bericht/${i}">Kop ${i}</a></li>`).join("");
function ophalen(afwijking: Record<string, Response> = {}) {
  const paden: string[] = [];
  const fetchStub = async (url: URL) => {
    paden.push(url.pathname);
    return afwijking[url.pathname] || new Response(url.pathname === "/data.json" ? JSON.stringify({ items: Array(20).fill({}) }) : url.pathname === "/vandaag" ? koppen : "OK");
  };
  return { fetchStub, paden };
}
const goed = ophalen();
await rooktest("https://voorbeeld.nl", goed.fetchStub);
assert.deepEqual(goed.paden, ["/", "/data.json", "/vandaag", "/over", "/bericht/0"]);
await assert.rejects(rooktest("https://voorbeeld.nl", ophalen({ "/over": new Response("", { status: 500 }) }).fetchStub), /\/over: HTTP 500/);
await assert.rejects(rooktest("https://voorbeeld.nl", ophalen({ "/data.json": Response.json({ items: [] }) }).fetchStub), /minder dan 20 items/);
await assert.rejects(rooktest("https://voorbeeld.nl", ophalen({ "/data.json": new Response("{") }).fetchStub), /ongeldige JSON/);
await assert.rejects(rooktest("https://voorbeeld.nl", ophalen({ "/vandaag": new Response("") }).fetchStub), /0 koppen/);
await assert.rejects(rooktest("https://voorbeeld.nl", (_url: URL, opties: { signal: AbortSignal }) => new Promise((_resolve, reject) => { const timer = setTimeout(() => reject(new Error("geen timeout")), 1000); opties.signal.addEventListener("abort", () => { clearTimeout(timer); reject(opties.signal.reason); }); }), 10), /timeout/);
