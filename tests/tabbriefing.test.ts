import { strict as assert } from "node:assert";
import { TabBriefing, kopKompact } from "../src/tabbriefing";

assert.equal(TabBriefing({ children: "kaart", aantal: 2 }), null);
assert.equal(TabBriefing({ text: "Nieuws.", children: "kaart", aantal: 0 }), null);
assert.ok(TabBriefing({ text: "Nieuws.", children: "kaart", aantal: 2 }));
assert.equal(kopKompact(false, undefined, 5), true);
assert.equal(kopKompact(false, "Nieuws.", 5), false);
assert.equal(kopKompact(true, undefined, 5), false);
