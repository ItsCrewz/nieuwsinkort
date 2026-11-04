// Controle van AI-samenvattingen (#476): worker/src/somcheck.ts, herpoging in summarize en hergebruik van gecachete sommen.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { controleerSom, samenvattingOk, zuiverSom } from "../worker/src/somcheck";
import { summarize, type Usage } from "../worker/src/ai";
import { splitState } from "../worker/src/opslag";

let n = 0;
const t = async (naam: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", naam); };
const florida = { kop: "Privéjet crash in Florida", ai: "Privéjet crash in Florida", samenvatting: "Negen inzittenden om het leven", punten: ["Florida", "Florida"] };
const FL_TITEL = "Negen doden bij crash privéjet in woonwijk Florida, toestel ontploft naast drukke weg";
const goed = {
  kop: "Negen doden bij privéjet-crash in Florida",
  ai: "Een privévliegtuig stortte neer in een woonwijk in de Amerikaanse staat Florida. Alle negen inzittenden kwamen om.",
  samenvatting: "Het toestel viel naast een drukke weg uit de lucht. Het ging in vlammen op. Alle negen mensen aan boord overleefden het niet.",
  punten: ["Het toestel ontplofte naast een drukke weg", "Er zijn beelden van de val"],
};

await t("Florida-antwoord wordt afgekeurd (kern gelijk aan kop)", () => {
  const r = controleerSom(florida);
  assert.equal(r.ok, false);
  assert.equal(samenvattingOk(florida), false);
});
await t("kern leeg, ai ⊂ kop, bijna gelijk aan kop of aan een brontitel: af", () => {
  assert.equal(controleerSom({ ...goed, ai: "" }).ok, false);
  assert.equal(controleerSom({ ...goed, ai: "Crash in Florida" }).ok, false);
  assert.equal(controleerSom({ ...goed, kop: "Privéjet crasht in Florida!", ai: "privejet crasht in florida" }).ok, false);
  assert.equal(controleerSom({ ...goed, ai: "Hoofdletters, leestekens én accenten tellen niet mee: PRIVÉJET crash in Florida" }).ok, true);
});
await t("kern voegt < 3 inhoudswoorden toe aan de kop: af (Florida-varianten uit de review)", () => {
  const kop = "Privéjet crash in Florida";
  assert.equal(controleerSom({ ...goed, kop, ai: "Privéjet stort neer in Florida" }).ok, false);
  assert.equal(controleerSom({ ...goed, kop, ai: kop + ". Negen doden." }).ok, false);
  assert.equal(controleerSom({ ...goed, kop, ai: "Privéjet in Florida neergestort" }).ok, false);
  assert.equal(controleerSom({ ...goed, kop, ai: "Een privéjet crasht in een woonwijk in Florida; negen doden." }).ok, true);
});
await t("een kern die op de brontitel lijkt maar iets toevoegt blijft goed (Gielegou Rige met lege fd, Loiza Lamers/Showbytes)", () => {
  const sommen = JSON.parse(readFileSync("tests/fixtures/sommen-goed.json", "utf8"));
  for (const naam of ["Gielegou", "Loiza"]) {
    const { titels, ...s } = sommen.find((x: any) => JSON.stringify(x).includes(naam)) || {};
    assert.ok(s.kop, naam + " staat in de fixture");
    assert.ok(controleerSom(s).ok, naam);
  }
});
await t("samenvatting leeg of te kort, of gelijk aan kop/kern: af; leeg bij een inhoudelijke kern mag (dunne bron)", () => {
  assert.equal(controleerSom({ ...goed, samenvatting: "Negen inzittenden om het leven" }).ok, false);
  assert.equal(controleerSom({ ...goed, samenvatting: goed.kop }).ok, false);
  assert.equal(controleerSom({ ...goed, samenvatting: goed.ai }).ok, false);
  assert.equal(controleerSom({ ...goed, samenvatting: "" }).ok, true);
  assert.equal(controleerSom({ ...goed, ai: "Korte kern.", samenvatting: "" }).ok, false);
});
await t("losse slechte punten vallen weg, de som blijft", () => {
  const r = controleerSom({ ...goed, punten: ["Florida", goed.punten[0], goed.punten[0].toUpperCase(), goed.kop, "Een ander feit over de crash"] });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.som.punten, [goed.punten[0], "Een ander feit over de crash"]);
  const leeg = controleerSom({ ...goed, punten: ["Florida", "Florida"] });
  assert.ok(leeg.ok);
  if (leeg.ok) assert.deepEqual(leeg.som.punten, []);
});
await t("goede sommen uit de uurdata (fixture) blijven ongewijzigd goedgekeurd", () => {
  const sommen = JSON.parse(readFileSync("tests/fixtures/sommen-goed.json", "utf8"));
  assert.ok(sommen.length >= 5);
  for (const { titels, ...s } of sommen) {
    const r = controleerSom(s);
    assert.ok(r.ok, s.kop);
    if (r.ok) assert.deepEqual(r.som, s);
  }
});
await t("gecachete slechte som wordt genegeerd, een som met slechte punten opgeschoond", () => {
  assert.equal(zuiverSom({ ...florida, at: 1 }), null);
  assert.equal(zuiverSom(null), null);
  const z = zuiverSom({ ...goed, punten: ["Florida", "Florida"], at: 5 });
  assert.deepEqual(z, { ...goed, punten: [], at: 5 });
});

// ---- summarize: precies één herpoging via de externe keten
const items = [{ id: 1, cat: "nl", bronnen: ["RTL Nieuws"], titels: [FL_TITEL], tekst: "Bij een vliegtuigcrash in een woonwijk ..." }];
const antwoord = (s: object) => JSON.stringify({ items: [{ id: 1, ...s }] });
const usage = (extern = true): Usage => ({ neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0, llm: { ...(extern ? { sleutel: "test-fixture" } : {}), state: {}, wacht: { totaal: 0 } } });
const cf = (a: string) => { const ai = { n: 0, run: async () => { ai.n++; return { response: a }; } }; return ai; };
const origineel = globalThis.fetch;
let groqCalls = 0;
const groq = (...a: string[]) => { groqCalls = 0; globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: a[Math.min(groqCalls++, a.length - 1)] } }], usage: { prompt_tokens: 100, completion_tokens: 50 } })) as typeof fetch; };
try {
  await t("afgekeurd antwoord: één herpoging via Groq, de goede tweede som wordt gebruikt", async () => {
    groq(antwoord(goed));
    const u = usage(), ai = cf(antwoord(florida)), af = new Set<number>();
    const res = await summarize(ai as any, "m", items, u, af);
    assert.equal(ai.n, 1);
    assert.equal(groqCalls, 1);
    assert.deepEqual(res.get(1), goed);
    assert.equal(af.size, 0);
    assert.deepEqual([u.somAfgekeurd, u.somHerpoging, u.somOpgegeven || 0], [1, 1, 0]);
    assert.equal(u.terugval || 0, 0, "herpoging telt alleen als somHerpoging");
  });
  await t("ook de herpoging afgekeurd: geen som, id in afgekeurd, nooit een tweede herpoging", async () => {
    groq(antwoord(florida));
    const u = usage(), ai = cf(antwoord(florida)), af = new Set<number>();
    const res = await summarize(ai as any, "m", items, u, af);
    assert.equal(res.size, 0);
    assert.deepEqual([...af], [1]);
    assert.equal(ai.n, 1);
    assert.equal(groqCalls, 1);
    assert.equal(u.somOpgegeven, 1);
  });
  await t("zonder externe keten geen herpoging en geen extra Cloudflare-aanroep", async () => {
    groq(antwoord(goed));
    const u = usage(false), ai = cf(antwoord(florida)), af = new Set<number>();
    assert.equal((await summarize(ai as any, "m", items, u, af)).size, 0);
    assert.equal(ai.n, 1);
    assert.equal(groqCalls, 0);
    assert.deepEqual([...af], [1]);
  });
  await t("keten vol (ruimteVoor false): geen herpoging, wel afgekeurd, niets telt als terugval", async () => {
    groq(antwoord(goed));
    const u = usage(), ai = cf(antwoord(florida)), af = new Set<number>();
    const vol = { dag: new Date().toISOString().slice(0, 10), calls: 1e9, tokens: 1e12 };
    for (const m of ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]) u.llm!.state[`groq:${m}`] = vol as any;
    assert.equal((await summarize(ai as any, "m", items, u, af)).size, 0);
    assert.equal(groqCalls, 0);
    assert.deepEqual([...af], [1]);
    assert.equal(u.terugval || 0, 0);
  });
  await t("goed antwoord: geen herpoging", async () => {
    groq(antwoord(florida));
    const ai = cf(antwoord(goed)), u = usage();
    assert.deepEqual((await summarize(ai as any, "m", items, u)).get(1), goed);
    assert.equal(groqCalls, 0);
    assert.equal(u.somAfgekeurd || 0, 0);
  });
} finally { globalThis.fetch = origineel; }

await t("afkeurmarkering staat in DO-opslag (st:rest), geen eigen KV-sleutel", () => {
  const delen = splitState({ somAfgekeurd: { "cluster-1": 123 }, sums: {}, links: {}, hashes: {} });
  assert.deepEqual(JSON.parse(delen["st:rest"]).somAfgekeurd, { "cluster-1": 123 });
  assert.ok(!Object.keys(delen).some((k) => /afgekeurd/i.test(k)));
});

console.log(`\n${n} somcheck-tests geslaagd`);
