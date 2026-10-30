import assert from "node:assert/strict";
// @ts-ignore — .mjs-script zonder typen
import { voegSamen } from "../scripts/changelog.mjs";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };

t("changelog: nummers zonder voorloopnullen worden tekstueel gesorteerd", () => {
  const r = voegSamen("# Changelog\n\n## Onuitgebracht\n", [
    { naam: "2-a.md", tekst: "Twee" },
    { naam: "100-c.md", tekst: "Honderd" },
    { naam: "10-b.md", tekst: "Tien" },
  ]);
  assert.equal(r, "# Changelog\n\n## Onuitgebracht\n\n- Tien\n- Honderd\n- Twee\n");
});

t("changelog: voorloopnullen geven de numerieke volgorde 2, 10, 100", () => {
  const r = voegSamen("# Changelog\n\n## Onuitgebracht\n", [
    { naam: "100-c.md", tekst: "Honderd" },
    { naam: "002-a.md", tekst: "Twee" },
    { naam: "010-b.md", tekst: "Tien" },
  ]);
  assert.equal(r, "# Changelog\n\n## Onuitgebracht\n\n- Twee\n- Tien\n- Honderd\n");
});

t("changelog: een fragment met meerdere regels blijft één blok", () => {
  const r = voegSamen("# Changelog\n\n## Onuitgebracht\n", [
    { naam: "1-a.md", tekst: "  Eerste regel\n  vervolgregel\n- Tweede punt.\n" },
  ]);
  assert.equal(r, "# Changelog\n\n## Onuitgebracht\n\n- Eerste regel\n  vervolgregel\n- Tweede punt.\n");
});

t("changelog: Windows-regeleinden binnen een fragment blijven behouden", () => {
  const r = voegSamen("# Changelog\n\n## Onuitgebracht\n", [
    { naam: "1-a.md", tekst: "\r\n* Eerste punt.\r\n* Tweede punt.\r\n" },
  ]);
  assert.equal(r, "# Changelog\n\n## Onuitgebracht\n\n* Eerste punt.\r\n* Tweede punt.\n");
});

t("changelog: een lege sectie vóór een release wordt gevuld", () => {
  const r = voegSamen("# Changelog\n\n## Onuitgebracht\n\n## 2026-10-30\n\n- Oud.\n", [
    { naam: "1-a.md", tekst: "Nieuw." },
  ]);
  assert.equal(r, "# Changelog\n\n## Onuitgebracht\n\n- Nieuw.\n\n## 2026-10-30\n\n- Oud.\n");
});

t("changelog: een laatste sectie behoudt bestaande punten", () => {
  const r = voegSamen("# Changelog\n\n## 2026-10-30\n\n- Oud.\n\n## Onuitgebracht\n\n- Bestaand.\n", [
    { naam: "1-a.md", tekst: "Nieuw." },
  ]);
  assert.equal(r, "# Changelog\n\n## 2026-10-30\n\n- Oud.\n\n## Onuitgebracht\n\n- Nieuw.\n\n- Bestaand.\n");
});

t("changelog: tweemaal samenvoegen met een lege set verandert niets", () => {
  const basis = "# Changelog\n\n## Onuitgebracht\n\n- Bestaand.\n";
  const eenmaal = voegSamen(basis, []);
  const tweemaal = voegSamen(eenmaal, []);
  assert.equal(eenmaal, basis);
  assert.equal(tweemaal, basis);
});