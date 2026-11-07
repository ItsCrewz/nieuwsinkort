import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelPad, linkId, oudeLinkId } from "../../src/artikelid";
import { onRequestGet } from "../../functions/bericht/[[pad]]";
import { normLink } from "../../worker/src/cluster";

const een = "https://voorbeeld.nl/artikel?id=1", twee = "https://voorbeeld.nl/artikel?id=2";
assert.notEqual(linkId(een), linkId(twee));
assert.notEqual(normLink(een), normLink(twee));
assert.notEqual(linkId(normLink(een)), linkId(normLink(twee)));
assert.notEqual(linkId(`${een}&id=2`), linkId(`${een}&id=3`));
assert.notEqual(linkId(`${een}&tekst=A`), linkId(`${een}&tekst=a`));
assert.equal(linkId(`${een}&utm_source=x&FBCLID=y#kop`), linkId(een));
assert.equal(linkId(`${een}&rubriek=nieuws`), linkId("https://voorbeeld.nl/artikel?rubriek=nieuws&id=1"));
assert.equal(linkId("https://voorbeeld.nl/artikel?utm_medium=x"), oudeLinkId(een));

const nu = Date.now;
try {
  Date.now = () => Date.parse("2026-11-04T12:00:00Z");
  const dag = "2026-11-04";
  const items = [een, twee].map((href, i) => ({ kop: `Bericht ${i + 1}`, bronnen: [{ site: "Voorbeeld", href }] }));
  const env = {
    NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify({ gegenereerd: `${dag}T09:00:00Z`, items })}` },
    ASSETS: { fetch: async () => new Response(readFileSync("index.html", "utf8"), { headers: { "Content-Type": "text/html" } }) },
  };
  const bezoek = (pad: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}`), env, waitUntil: () => {} });
  for (const item of items) {
    const r = await bezoek(artikelPad(item, dag));
    assert.equal(r.status, 200);
    assert.ok((await r.text()).includes(item.kop));
  }
  const oud = `/bericht/${dag}/${oudeLinkId(een)}-oud`;
  let r = await bezoek(oud);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/");
  items.pop();
  r = await bezoek(oud);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), artikelPad(items[0], dag));
  const bestaand = { ...items[0], id: oudeLinkId(een) };
  items[0] = bestaand;
  assert.equal((await bezoek(artikelPad(bestaand, dag))).status, 200);
} finally { Date.now = nu; }
