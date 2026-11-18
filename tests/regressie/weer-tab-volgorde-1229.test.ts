import assert from "node:assert/strict";
import { merge } from "../../src/dagdata";

// #1229: de recentste dataset bepaalt weer en rubriekbriefing; ontbrekende velden komen uit de andere.
const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const basis = { items: [], filmpjes: [], dumpert: [] };
  const S = { ...basis, gegenereerd: "2026-11-04T09:00:00Z", weer: { nu: { temp: 12 }, dagen: [{ dag: "do" }], verwachting: "routine" }, tab_samenvatting: { nl: { tekst: "r nl" }, tech: { tekst: "r tech" } } };
  const H = { ...basis, gegenereerd: "2026-11-04T10:00:00Z", weer: { nu: { temp: 9 } }, tab_samenvatting: { nl: { tekst: "u nl" } } };
  const nieuwUur: any = merge(S, H);
  assert.deepEqual(nieuwUur.weer, { nu: { temp: 9 }, dagen: [{ dag: "do" }], verwachting: "routine" });
  assert.equal(nieuwUur.tab_samenvatting.nl.tekst, "u nl");
  assert.equal(nieuwUur.tab_samenvatting.tech.tekst, "r tech");
  const oudUur: any = merge(S, { ...H, gegenereerd: "2026-11-04T08:00:00Z", weer: { nu: { temp: 9 }, verwachting: "uur" } });
  assert.deepEqual(oudUur.weer, { nu: { temp: 12 }, dagen: [{ dag: "do" }], verwachting: "routine" });
  assert.equal(oudUur.tab_samenvatting.nl.tekst, "r nl");
  const oudUurAanvul: any = merge({ ...S, weer: { nu: { temp: 12 } } }, { ...H, gegenereerd: "2026-11-04T08:00:00Z", weer: { nu: { temp: 9 }, dagen: [{ dag: "vr" }], verwachting: "uur" } });
  assert.deepEqual(oudUurAanvul.weer, { nu: { temp: 12 }, dagen: [{ dag: "vr" }], verwachting: "uur" });
  // Ongeldige tabwaarde wordt genegeerd, niet per teken uitgesplitst.
  const fout: any = merge({ ...S, tab_samenvatting: "abc" }, H);
  assert.deepEqual(Object.keys(fout.tab_samenvatting), ["nl"]);
  assert.equal((merge({ ...S, tab_samenvatting: "abc" }, { ...H, tab_samenvatting: "xyz" }) as any).tab_samenvatting, undefined);
} finally {
  Date.now = origineel;
}
console.log("✓ weer/tab_samenvatting: volgorde en ontbrekende velden (#1229)");
