import assert from "node:assert/strict";
import { filterNieuws, STANDAARD } from "../../src/filters";
import type { Item } from "../../src/types";

const oorspronkelijkNu = Date.now;
const bericht = (kop: string, tijd: string, t?: number): Item => ({
  kop, tijd, t, cat: "nl", ai: "", samenvatting: "", punten: [], bronnen: [],
});
const namen = (items: Item[]) => items.map((item) => item.kop);

try {
  Date.now = () => Date.parse("2026-10-25T02:45:00+01:00");
  const items = [
    bericht("eerste 02:30", "02:30", Date.parse("2026-10-25T02:30:00+02:00")),
    bericht("tweede 02:30", "02:30", Date.parse("2026-10-25T02:30:00+01:00")),
    bericht("eerder", "00:30", Date.parse("2026-10-25T00:30:00+02:00")),
    bericht("later", "02:50", Date.parse("2026-10-25T02:50:00+01:00")),
  ];
  const filter = (tijd: "alles" | "1u" | "3u", sort: "nieuw" | "oud" = "nieuw") =>
    filterNieuws(items, { ...STANDAARD, tijd, sort }, 0, new Date(Date.now()).toISOString(), true);
  assert.deepEqual(namen(filter("alles").items), ["later", "tweede 02:30", "eerste 02:30", "eerder"]);
  assert.deepEqual(namen(filter("alles", "oud").items), ["eerder", "eerste 02:30", "tweede 02:30", "later"]);
  assert.deepEqual(namen(filter("1u").items), ["later", "tweede 02:30"]);
  assert.deepEqual(namen(filter("3u").items), ["later", "tweede 02:30", "eerste 02:30"]);
  assert.equal(filter("alles").per["1u"], 2);
  assert.equal(filter("alles").per["3u"], 3);

  for (const nu of ["2026-03-29T03:30:00+02:00", "2026-07-15T10:00:00+02:00", "2026-01-15T10:00:00+01:00"]) {
    Date.now = () => Date.parse(nu);
    const recent = bericht("recent", "00:00", Date.now() - 30 * 60e3);
    const ouder = bericht("ouder", "23:59", Date.now() - 2 * 3600e3);
    for (const [tijd, verwacht] of [["1u", ["recent"]], ["3u", ["recent", "ouder"]]] as const) {
      assert.deepEqual(namen(filterNieuws([ouder, recent], { ...STANDAARD, tijd }, 0, nu, true).items), verwacht);
    }
  }
  Date.now = () => Date.parse("2026-01-15T10:00:00+01:00");
  const oud = [bericht("zonder t", "09:30"), bericht("ongeldige t", "09:40", NaN), bericht("zonder tijd", "", 0)];
  assert.deepEqual(namen(filterNieuws(oud, { ...STANDAARD, tijd: "1u" }, 0, undefined, true).items), ["ongeldige t", "zonder t", "zonder tijd"]);
  console.log("✓ absolute publicatietijd rond klokwisselingen en terugval voor oudere data");
} finally {
  Date.now = oorspronkelijkNu;
}
