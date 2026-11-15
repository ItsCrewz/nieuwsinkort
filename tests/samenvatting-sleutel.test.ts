import assert from "node:assert/strict";
import { onRequestGet } from "../functions/samenvatting";
import { svSleutel, videoSlug } from "../src/slug";

// Cachesleutels van video-samenvattingen (#687): v-<hash> heeft een eigen versie-prefix; mock-KV, geen AI.
const inhoud: Record<string, any> = {};
const env = { NIEUWS: { async get(k: string) { return inhoud[k] ?? null; }, async put() {}, async delete() {} }, ASSETS: { async fetch() { return Response.json({}); } }, AI: { async run() { throw new Error("geen AI"); } } };
const haal = async (id: string) => (await onRequestGet({ request: new Request(`https://x.example/samenvatting?id=${id}`), env } as any)).json() as Promise<any>;

const v = videoSlug({ titel: "Zelfde", href: "https://example.com/a/1" } as any);
assert.match(v, /^v-/);
assert.equal(svSleutel(v), `vs2:${v}`);
assert.equal(svSleutel("yt-abcdefghijk"), "vs:yt-abcdefghijk");
assert.equal(svSleutel("d-123"), "vs:d-123");

inhoud[`vs:${v}`] = { ok: true, punten: ["oude titel-treffer"] };
assert.equal((await haal(v)).ok, false, "oude vs:v-… treffer wordt niet teruggegeven");
inhoud[`vs2:${v}`] = { ok: true, punten: ["nieuw"] };
assert.deepEqual((await haal(v)).punten, ["nieuw"]);
inhoud["vs:yt-abcdefghijk"] = { ok: true, punten: ["yt"] };
assert.deepEqual((await haal("yt-abcdefghijk")).punten, ["yt"]);
console.log("samenvatting-sleutel: geslaagd");
