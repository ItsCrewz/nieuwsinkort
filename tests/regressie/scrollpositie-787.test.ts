import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { herstelNieuwspositie, leesNieuwspositie, bewaarNieuwspositie } from "../../src/nieuwspositie";
import { artikelId } from "../../src/artikelid";

// Bestaande fallbackdata vormt een echte lijst met bericht-ID's.
const data = JSON.parse(readFileSync("public/data.json", "utf8"));
const ids: string[] = data.items.slice(0, 5).map(artikelId);
assert.equal(new Set(ids).size, 5);
const opslag = new Map<string, string>();
(globalThis as any).sessionStorage = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => opslag.set(k, v) };
const positie = { id: ids[2], offset: 12, volgorde: ids.slice(1), nieuw: [] };
bewaarNieuwspositie("nl", positie);
assert.deepEqual(leesNieuwspositie("nl"), positie);
assert.equal(leesNieuwspositie("sport"), null);
assert.deepEqual(herstelNieuwspositie(positie, ids), { id: ids[2], nieuw: [ids[0]] });
assert.deepEqual(herstelNieuwspositie(positie, ids.filter((id) => id !== ids[2])), { id: ids[3], nieuw: [ids[0]] });
assert.deepEqual(herstelNieuwspositie({ ...positie, id: null }, ids), { id: null, nieuw: [] });
