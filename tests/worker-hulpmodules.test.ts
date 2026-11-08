import assert from "node:assert/strict";
import { clusterHash, vindClusterSum } from "../worker/src/clusterhash";
import { bewaakteRun } from "../worker/src/run-status";
import { volgorde, vooraf } from "../worker/src/vooraf";
import { artikelTekst, jinaTekst } from "../worker/src/artikel";

const hash = clusterHash("Café en bomen bomen groeien", "nl");
assert.equal(hash, clusterHash("GROEIEN café bomen", "nl"));
assert.notEqual(hash, clusterHash("GROEIEN café bomen", "tech"));
assert.equal(clusterHash("een en AI", "nl"), "");
assert.equal(clusterHash("", "nl"), "");
const sums = { sleutel: { at: 1000, tekst: "één" } };
const hashes = { [hash]: "sleutel" };
assert.equal(vindClusterSum(hashes, sums, "café bomen groeien", "nl", 1000), sums.sleutel);
assert.equal(vindClusterSum(hashes, sums, "café bomen groeien", "nl", 999), null);
assert.equal(vindClusterSum(hashes, sums, "café bomen groeien", "nl", 1000 + 86400000), null);
assert.equal(vindClusterSum({}, sums, "café bomen groeien", "nl", 1000), null);

let status: any;
const writes: string[] = [];
const storage = { async get<T>() { return status as T; }, async put(_key: string, value: any) { status = value; } };
const kv = { async put(key: string, value: string) { writes.push(key); assert.deepEqual(JSON.parse(value), status); } };
const origineleFout = console.error;
console.error = () => {};
try {
  let r = await bewaakteRun(async () => { throw new Error("mislukt"); }, storage, kv);
  assert.equal(r.status, 500);
  assert.equal((await r.json() as any).err, "mislukt");
  assert.equal(status.faalReeks, 1);
  assert.ok(status.laatsteFout.endsWith("Z"));
  const fout = status.laatsteFout;
  r = await bewaakteRun(async () => ({ ok: true }), storage, kv);
  assert.equal(r.status, 200);
  assert.equal(status.faalReeks, 0);
  assert.equal(status.laatsteFout, fout);
  assert.ok(status.laatsteOk.endsWith("Z"));
  assert.deepEqual(writes, ["run-status", "run-status"]);
  const defect = { ...storage, async put() { throw new Error("opslag"); } };
  assert.equal((await bewaakteRun(async () => "klaar", defect, kv)).status, 200);
} finally { console.error = origineleFout; }

const alinea = "De gemeente Haarlem onderzoekt vandaag hoe bewoners met elkaar meer ruimte kunnen krijgen voor groene bomen en veilige straten in hun buurt.";
const alinea2 = "Volgens de betrokken wethouder krijgen inwoners binnenkort de gelegenheid om hun ideeën tijdens een openbare bijeenkomst te bespreken.";
assert.deepEqual(artikelTekst(""), []);
assert.deepEqual(artikelTekst(`<p>kort</p><p>${alinea}</p><p>${alinea}</p><p>${alinea2}</p>`), [alinea, alinea2]);
assert.deepEqual(artikelTekst(`<script type="application/ld+json">ongeldig</script><p>${alinea}</p>`), [alinea]);
const ld = JSON.stringify({ "@graph": [{ articleBody: `${alinea}\n${alinea2}\n${alinea}` }] });
assert.deepEqual(artikelTekst(`<script type="application/ld+json">${ld}</script><p>kort</p>`), [alinea, alinea2]);
assert.ok(artikelTekst(`<p>${alinea}</p>`, 70)[0].endsWith("…"));
assert.deepEqual(jinaTekst(""), []);
assert.deepEqual(jinaTekst(`Titel\nMarkdown Content:\n\n[${alinea}](https://voorbeeld.nl)\n\n${alinea}\n\n${alinea2}`), [alinea, alinea2]);
assert.deepEqual(jinaTekst(`Cookie instellingen en abonnementen beheren zijn hier beschikbaar voor alle bezoekers van deze website.\n\n${alinea}`), [alinea]);

const yt = { titel: "Eén", href: "https://youtu.be/abcdefg" };
const yt2 = { titel: "Twee", href: "https://youtu.be/hijklmn" };
const dumpert = { titel: "Drie", href: "https://dumpert.nl/item/123" };
assert.deepEqual(volgorde(null), []);
assert.deepEqual(volgorde({ filmpjes: [yt, yt], dumpert: [dumpert] }).map(v => v.href), [yt.href, dumpert.href]);
const oudeFetch = globalThis.fetch;
const verzoeken: any[] = [];
const opgeslagen: Record<string, any> = {};
globalThis.fetch = (async (url: any, init?: any) => {
  verzoeken.push({ url: String(url), init });
  if (String(url).includes("data.json")) return Response.json({ filmpjes: [yt, yt2], dumpert: [dumpert] });
  const id = JSON.parse(init.body).id;
  return Response.json(id === "yt-hijklmn" ? { ok: false, code: "budget-pre" } : { ok: true, punten: ["nieuws"], neuronen: 5 });
}) as typeof fetch;
try {
  const nieuws = { async get(key: string) { return key === "vs:yt-abcdefg" ? { ok: true, punten: ["cache"] } : null; }, async put(key: string, value: string) { opgeslagen[key] = JSON.parse(value); } };
  const resultaat = await vooraf({ NIEUWS: nieuws as any, SITE: "https://voorbeeld.invalid" }, 100);
  assert.equal(resultaat.stop, "dagbudget");
  assert.equal(resultaat.verzoeken, 1);
  assert.equal(resultaat.klaar, 1);
  assert.deepEqual(opgeslagen["sv-klaar"].klaar["yt-abcdefg"].punten, ["cache"]);
  assert.deepEqual(JSON.parse(verzoeken[1].init.body), { id: "yt-hijklmn", pre: true });
} finally { globalThis.fetch = oudeFetch; }
console.log("✓ worker-hulpmodules");
