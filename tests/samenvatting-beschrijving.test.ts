import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { onRequestPost, onRequestGet } from "../functions/samenvatting";
import { samenvattingBasis } from "../src/samenvatting-basis";
import { parseYouTube } from "../worker/src/videos";

const tekst = "Een uitgebreide beschrijving van het nieuws. ".repeat(30);
const xml = `<entry><published>2026-10-30T10:00:00Z</published><yt:videoId>abcdefghijk</yt:videoId><title>Nieuws vandaag</title><media:description>${tekst}</media:description></entry>`;
const video = parseYouTube(xml, "NOS", 0, () => "10:00")[0];
assert.equal(video.beschrijving, tekst.trim().slice(0, 2000));
const waarden: Record<string, any> = { uur: { filmpjes: [video] }, "vs:yt-abcdefghijk": { ok: true, punten: ["oud"] } };
let aanroepen = 0, prompt = "";
const env: any = { NIEUWS: { async get(k: string) { return waarden[k] ?? null; }, async put(k: string, v: string) { waarden[k] = JSON.parse(v); }, async delete(k: string) { delete waarden[k]; } }, ASSETS: { async fetch() { return Response.json({}); } }, AI: { async run(_m: string, input: any) { aanroepen++; prompt = input.messages[1].content; return { response: "- Eerste punt\n- Tweede punt" }; } }, BUDGET: "100000" };
const post = () => onRequestPost({ request: new Request("https://site.test/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "yt-abcdefghijk" }) }), env });
let r: any = await (await post()).json();
assert.equal(r.basis, "beschrijving");
assert.equal(aanroepen, 1);
assert.ok(prompt.includes(video.titel) && prompt.includes(video.beschrijving!));
assert.ok(prompt.includes("2 tot 4") && !prompt.includes("wat er gezegd wordt"));
assert.equal(samenvattingBasis(r.basis, r.bron, 0), "op basis van beschrijving");
assert.ok(waarden["vs2:yt-abcdefghijk"]);
delete waarden["vs2:yt-abcdefghijk"];
video.beschrijving = "Te kort";
r = await (await post()).json();
assert.equal(r.code, "te-weinig-beschrijving");
assert.equal(aanroepen, 1);
assert.equal((await (await onRequestGet({ request: new Request("https://site.test/samenvatting?id=yt-abcdefghijk"), env })).json() as any).code, "te-weinig-beschrijving");
for (const f of readdirSync("functions").filter((x) => x.endsWith(".ts"))) {
  assert.doesNotMatch(readFileSync(`functions/${f}`, "utf8"), /youtubei\/v1|inv\.nadeko\.net|yewtu\.be|invidious\.nerdvpn\.de|com\.google\.(?:android|ios)\.youtube|TVHTML5_SIMPLY_EMBEDDED_PLAYER/);
}
console.log("samenvatting beschrijving: geslaagd");
