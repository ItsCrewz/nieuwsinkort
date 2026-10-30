import { strict as assert } from "node:assert";
import { maakTabSam, tabSleutel } from "../worker/src/tabsam";

const data = [{ cat: "nl", kop: "Het nieuws", ai: "Er is nieuws." }, { cat: "nl", kop: "Meer nieuws", ai: "Er is meer nieuws." }];
const opslag = new Map<string, string>();
const kv = { async get(k: string) { return opslag.get(k) || null; }, async put(k: string, v: string) { opslag.set(k, v); } };
assert.equal(await tabSleutel("nl", data), await tabSleutel("nl", [...data].reverse()));
assert.notEqual(await tabSleutel("nl", data), await tabSleutel("alles", data));
let calls = 0;
const maak = async () => { calls++; return { tekst: "Een korte tekst.", bron: "cloudflare" }; };
await maakTabSam(kv, "nl", data, 0, maak);
await maakTabSam(kv, "nl", [...data].reverse(), 1, maak);
assert.equal(calls, 1);
const terugval = await maakTabSam(kv, "tech", data, 0, async () => { throw new Error("niet beschikbaar"); });
assert.equal(terugval.sam.ai, false);
assert.match(terugval.sam.tekst, /Er is nieuws/);
const zonderAi = await maakTabSam(kv, "alles", data, 0);
assert.equal(zonderAi.sam.bron, "extractief");
console.log("Tabsamenvatting: cache en terugval goed");
