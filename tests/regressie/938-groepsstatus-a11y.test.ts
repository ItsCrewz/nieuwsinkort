import assert from "node:assert/strict";
import { GroupToggle, Switch } from "../../src/ui";

// Groepsbediening: geldige ARIA-status voor aan, uit en gedeeltelijk; Switch blijft strikt aan/uit.
const label = "Alle bronnen in Nederland";
const calls: boolean[] = [];
for (const [c, aria, kl, na] of [[true, true, "sw on", false], [false, false, "sw ", true], ["mixed", "mixed", "sw mixed", true]] as const) {
  const el: any = GroupToggle({ checked: c, label, onChange: (v) => calls.push(v) });
  assert.equal(el.type, "button");
  assert.equal(el.props.role, "checkbox");
  assert.equal(el.props["aria-checked"], aria);
  assert.equal(el.props["aria-label"], label);
  assert.equal(el.props.className, kl);
  el.props.onClick();
  assert.equal(calls.at(-1), na);
}
for (const c of [true, false]) {
  const el: any = Switch({ checked: c, label: "A", onChange: () => {} });
  assert.equal(el.props.role, "switch");
  assert.equal(el.props["aria-checked"], c);
  assert.notEqual(el.props["aria-checked"], "mixed");
}
console.log("938 groepsstatus a11y: tests geslaagd");
