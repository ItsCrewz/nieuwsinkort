import assert from "node:assert/strict";
import { bronSleutel, eenPerUitgever } from "../src/uitgever";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };

t("bronSleutel normaliseert spaties, hoofdletters en bekende rubriekstaarten", () => {
  for (const staart of ["Voetbal", "Football", "Formule 1", "F1", "Auto", "Sport"]) {
    assert.equal(bronSleutel(`  NU.nl  ${staart}  `), "nu");
  }
  assert.equal(bronSleutel("  AD  "), "ad");
  assert.equal(bronSleutel(""), "");
});

t("bronSleutel verwijdert alleen een herkende staart aan het einde en een .nl aan het einde", () => {
  assert.equal(bronSleutel("The Verge"), "the verge");
  assert.equal(bronSleutel("The Decoder"), "the decoder");
  assert.equal(bronSleutel("Sport Nieuws"), "sport nieuws");
  assert.equal(bronSleutel("AD voetbal live"), "ad voetbal live");
  assert.equal(bronSleutel("voorbeeld.nl.com"), "voorbeeld.nl.com");
  assert.equal(bronSleutel("AD voetbal sport"), "ad voetbal");
});

t("eenPerUitgever behoudt de eerste bron, objecten en volgorde", () => {
  const bronnen = [
    { site: "NU.nl Voetbal", href: "eerste" },
    { site: "The Verge", href: "tweede" },
    { site: "nu", href: "dubbel" },
    { site: "The Decoder", href: "derde" },
    { site: "THE VERGE Sport", href: "dubbel" },
  ];
  const resultaat = eenPerUitgever(bronnen);
  assert.deepEqual(resultaat, [bronnen[0], bronnen[1], bronnen[3]]);
  assert.equal(resultaat[0], bronnen[0]);
  assert.equal(bronnen.length, 5);
});

t("eenPerUitgever verwerkt lege lijsten en lege uitgevers", () => {
  assert.deepEqual(eenPerUitgever([]), []);
  const bronnen = [{ site: " ", id: 1 }, { site: "", id: 2 }, { site: "AD", id: 3 }];
  assert.deepEqual(eenPerUitgever(bronnen), [bronnen[0], bronnen[2]]);
});
