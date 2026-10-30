import assert from "node:assert/strict";
import { onRequestGet as data } from "../functions/data.json";
import { onRequestGet as meer } from "../functions/meer";
import { onRequestGet as samenvattingGet, onRequestPost as samenvattingPost } from "../functions/samenvatting";

const inhoud: Record<string, any> = {};
const kv = {
  async get(key: string, _type?: any) { return inhoud[key] ?? null; },
  async put(key: string, value: string) { inhoud[key] = JSON.parse(value); },
  async delete(key: string) { delete inhoud[key]; },
};
const statisch = { gegenereerd: new Date().toISOString(), items: [], filmpjes: [], dumpert: [] };
const env = {
  NIEUWS: kv,
  ASSETS: { async fetch(_request: Request | string) { return Response.json(statisch); } },
  AI: { async run() { throw new Error("AI mag niet worden aangeroepen"); } },
};
const req = (pad: string, init?: RequestInit) => new Request(`https://nieuws.example${pad}`, init);
const headers = (r: Response, cache: string | null) => {
  assert.match(r.headers.get("content-type") || "", /^application\/json/);
  assert.equal(r.headers.get("cache-control"), cache);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
};

let r = await data({ request: req("/data.json"), env });
assert.equal(r.status, 200);
headers(r, "public, max-age=0, must-revalidate, stale-while-revalidate=300");
assert.deepEqual((await r.json()).items, []);
const etag = r.headers.get("etag");
assert.ok(etag);
r = await data({ request: req("/data.json", { headers: { "If-None-Match": etag } }), env });
assert.equal(r.status, 304);
assert.equal(await r.text(), "");
headers(r, "public, max-age=0, must-revalidate, stale-while-revalidate=300");
inhoud.uur = { ...statisch, dag_samenvatting: "Uurnieuws" };
inhoud["sv-klaar"] = { klaar: { video: { punten: ["Een punt"] } } };
r = await data({ request: req("/data.json"), env });
const samengevoegd: any = await r.json();
assert.equal(samengevoegd.dag_samenvatting, "Uurnieuws");
assert.deepEqual(samengevoegd.samenvattingen, inhoud["sv-klaar"].klaar);
r = await data({ request: req("/data.json?statisch=1"), env });
headers(r, "no-cache");
assert.deepEqual(await r.json(), statisch);

for (const pad of ["/meer", `/meer?k=${"a".repeat(601)}`]) {
  r = await meer({ request: req(pad), env });
  assert.equal(r.status, 400);
  headers(r, null);
}
r = await meer({ request: req("/meer?k=bericht"), env: {} });
assert.equal(r.status, 400);
r = await meer({ request: req("/meer?k=bericht"), env });
assert.equal(r.status, 404);
headers(r, "no-store");
inhoud.meer = { items: { bericht: { uitleg: ["Extra tekst"] } } };
r = await meer({ request: req("/meer?k=bericht"), env });
assert.equal(r.status, 200);
headers(r, "public, max-age=600");
assert.deepEqual(await r.json(), { uitleg: ["Extra tekst"] });

for (const pad of ["/samenvatting", "/samenvatting?id=!!", `/samenvatting?id=${"a".repeat(91)}`]) {
  r = await samenvattingGet({ request: req(pad), env });
  assert.equal(r.status, 400);
  headers(r, "no-store");
}
r = await samenvattingGet({ request: req("/samenvatting?id=video-123"), env });
assert.deepEqual(await r.json(), { ok: false, code: "geen" });
inhoud["vs:video-123"] = { ok: true, punten: ["Een punt"] };
r = await samenvattingGet({ request: req("/samenvatting?id=video-123"), env });
assert.deepEqual(await r.json(), { ok: true, punten: ["Een punt"], cached: true });
headers(r, "no-store");
const post = (body: string, extra: Record<string, string> = {}) => samenvattingPost({ request: req("/samenvatting", { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body }), env });
r = await samenvattingPost({ request: req("/samenvatting", { method: "POST", body: "{}" }), env });
assert.equal(r.status, 415);
headers(r, "no-store");
r = await post("{}", { Origin: "https://ander.example" });
assert.equal(r.status, 403);
r = await post("{}");
assert.equal(r.status, 400);
r = await post(JSON.stringify({ id: "onbekend" }));
assert.equal(r.status, 404);
r = await post(JSON.stringify({ id: "video-123" }));
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { ok: true, punten: ["Een punt"], cached: true });
headers(r, "no-store");
console.log("Pages Functions: geslaagd");
