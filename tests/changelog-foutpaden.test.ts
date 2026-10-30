import assert from "node:assert/strict";
// @ts-ignore — .mjs-script zonder typen
import { voegSamen } from "../scripts/changelog.mjs";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const basis = "# Changelog\n\n## Onuitgebracht\n\n- Oud punt.\n";

t("changelog: fragmentnaam zonder nummer wordt rechtstreeks geaccepteerd", () => {
  assert.equal(voegSamen(basis, [{ naam: "onderhoud.md", tekst: "- Nieuw punt." }]),
    "# Changelog\n\n## Onuitgebracht\n\n- Nieuw punt.\n\n- Oud punt.\n");
});

t("changelog: fragmentnaam met andere extensie wordt rechtstreeks geaccepteerd", () => {
  assert.equal(voegSamen(basis, [{ naam: "259-onderhoud.txt", tekst: "- Nieuw punt." }]),
    "# Changelog\n\n## Onuitgebracht\n\n- Nieuw punt.\n\n- Oud punt.\n");
});

t("changelog: zonder titel komt een nieuwe sectie voor de bestaande inhoud", () => {
  assert.equal(voegSamen("## 2026-10-30\n\n- Oud punt.\n", [{ naam: "259-test.md", tekst: "- Nieuw punt." }]),
    "\n## Onuitgebracht\n\n- Nieuw punt.\n## 2026-10-30\n\n- Oud punt.\n");
});

t("changelog: een andere hoofdkop geldt ook als titel", () => {
  assert.equal(voegSamen("# Overzicht\n\n## 2026-10-30\n\n- Oud punt.\n", [{ naam: "259-test.md", tekst: "- Nieuw punt." }]),
    "# Overzicht\n\n## Onuitgebracht\n\n- Nieuw punt.\n\n## 2026-10-30\n\n- Oud punt.\n");
});

t("changelog: een fragmentkop wordt als tekst van een opsommingspunt ingevoegd", () => {
  assert.equal(voegSamen(basis, [{ naam: "259-test.md", tekst: "## Eigen kop\n\n- Detail." }]),
    "# Changelog\n\n## Onuitgebracht\n\n- ## Eigen kop\n\n- Detail.\n\n- Oud punt.\n");
});