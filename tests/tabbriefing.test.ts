import { strict as assert } from "node:assert";
import { TabBriefing, kopKompact } from "../src/tabbriefing";

assert.equal(TabBriefing({ children: "kaart", aantal: 2 }), null);
assert.equal(TabBriefing({ text: "Nieuws.", children: "kaart", aantal: 0 }), null);
assert.ok(TabBriefing({ text: "Nieuws.", children: "kaart", aantal: 2 }));
assert.equal(kopKompact(false), true);
assert.equal(kopKompact(true), false);
