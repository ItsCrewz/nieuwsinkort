import assert from "node:assert/strict";
// @ts-ignore — .mjs-script zonder typen
import { voegSamen } from "../scripts/changelog.mjs";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const basis = "# Changelog\n\n## Onuitgebracht\n\n- Oud punt.\n\n## 2026-10-30\n\n- Ouder.\n";

t("changelog: fragmenten komen gesorteerd bovenaan Onuitgebracht", () => {
  const r = voegSamen(basis, [{ naam: "99-b.md", tekst: "- B (#99).\n" }, { naam: "12-a.md", tekst: "- A (#12).\n" }]);
  assert.equal(r, "# Changelog\n\n## Onuitgebracht\n\n- A (#12).\n- B (#99).\n\n- Oud punt.\n\n## 2026-10-30\n\n- Ouder.\n");
});
t("changelog: tekst zonder opsommingsteken krijgt er een, lege fragmenten vervallen", () => {
  const r = voegSamen(basis, [{ naam: "1-a.md", tekst: "Los punt." }, { naam: "2-b.md", tekst: "  \n" }]);
  assert.ok(r.includes("## Onuitgebracht\n\n- Los punt.\n\n- Oud punt."));
});
t("changelog: zonder fragmenten blijft alles gelijk; zonder sectie wordt hij aangemaakt", () => {
  assert.equal(voegSamen(basis, []), basis);
  const r = voegSamen("# Changelog\n\n## 2026-10-30\n\n- X.\n", [{ naam: "1-a.md", tekst: "- Y." }]);
  assert.equal(r, "# Changelog\n\n## Onuitgebracht\n\n- Y.\n\n## 2026-10-30\n\n- X.\n");
});
