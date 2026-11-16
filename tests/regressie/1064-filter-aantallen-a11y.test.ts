import assert from "node:assert/strict";
import { Chip } from "../../src/filters-blad";

// Filterchips: zichtbaar getal verborgen voor schermlezers, aantal berichten als verborgen tekst; status via aria-pressed.
function kinderen(n?: number) {
  const el: any = Chip({ on: true, onClick: () => {}, n, children: "Sport" });
  assert.equal(el.type, "button");
  assert.equal(el.props["aria-pressed"], true);
  return [].concat(el.props.children as any).filter(Boolean);
}
function vlak(x: any): any[] { return x?.type === Symbol.for("react.fragment") || x?.type?.toString?.().includes("fragment") ? [].concat(x.props.children).flatMap(vlak) : [x]; }
for (const [n, tekst] of [[0, ", 0 berichten"], [1, ", 1 bericht"], [3, ", 3 berichten"]] as const) {
  const delen = kinderen(n).flatMap(vlak);
  const zicht = delen.find((d: any) => d.props?.className?.includes("fchip-n"));
  const sr = delen.find((d: any) => d.props?.className === "sr-only");
  assert.equal(zicht.props["aria-hidden"], "true");
  assert.equal(zicht.props.children, n);
  assert.equal(sr.props.children, tekst);
}
assert.equal(kinderen(undefined).length, 1);
console.log("1064 filter-aantallen a11y: tests geslaagd");
