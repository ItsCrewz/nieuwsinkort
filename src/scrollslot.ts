// Gedeelde scrollvergrendeling voor vensters: overlappende dialogen heffen elkaar niet op.
// De oorspronkelijke inline overflow-waarden worden bij de eerste vergrendeling bewaard en
// pas na de laatste sluiting hersteld.
let teller = 0;
let oorspronkelijk: [string, string] = ["", ""];

export function vergrendelScroll(): () => void {
  const html = typeof document !== "undefined" ? document.documentElement : undefined;
  const body = typeof document !== "undefined" ? document.body : undefined;
  if (teller++ === 0) {
    oorspronkelijk = [html?.style?.overflow ?? "", body?.style?.overflow ?? ""];
    if (html?.style) html.style.overflow = "hidden";
    if (body?.style) body.style.overflow = "hidden";
  }
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    if (--teller > 0) return;
    teller = 0;
    if (html?.style) html.style.overflow = oorspronkelijk[0];
    if (body?.style) body.style.overflow = oorspronkelijk[1];
  };
}
