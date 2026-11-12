import assert from "node:assert/strict";
import { merge } from "../../src/dagdata";
import { normLink } from "../../worker/src/cluster";
import { linkId } from "../../src/artikelid";

const nu = new Date().toISOString();
const item = (kop: string, href: string) => ({ kop, cat: "nl", bronnen: [{ href }] });
const een = "https://voorbeeld.nl/artikel?id=1&utm_source=rss";
const twee = "https://voorbeeld.nl/artikel?id=2&fbclid=abc";
const sleutel = normLink(een);
const uit = merge({ gegenereerd: nu, items: [item("Eerste bericht", een)] }, {
  gegenereerd: nu, items: [item("Tweede nieuws", twee), item("Dubbele versie", "https://voorbeeld.nl/artikel?utm_medium=social&id=1")],
  meerKeys: [sleutel, normLink(twee)],
});
assert.deepEqual(uit.items.map((i: { kop: string }) => i.kop), ["Tweede nieuws", "Eerste bericht"]);
assert.deepEqual(uit.items.map((i: { meer: string }) => i.meer), [normLink(twee), sleutel]);
assert.notEqual(linkId(een), linkId(twee));
assert.equal(normLink("https://voorbeeld.nl/artikel?b=2&id=AbC&utm_campaign=x&a=1#deel"), normLink("https://voorbeeld.nl/artikel?a=1&id=AbC&b=2&gclid=y"));
assert.notEqual(normLink("https://voorbeeld.nl/artikel?id=AbC"), normLink("https://voorbeeld.nl/artikel?id=abc"));
