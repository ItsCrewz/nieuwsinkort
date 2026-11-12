// Vergelijk bronlinks zonder bekende meetparameters; artikelparameters blijven behouden.
export function normLink(link = ""): string {
  const [zonderFragment] = link.split("#", 1);
  const vraag = zonderFragment.indexOf("?");
  const pad = (vraag < 0 ? zonderFragment : zonderFragment.slice(0, vraag))
    .replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").toLowerCase();
  if (vraag < 0) return pad;
  const params = new URLSearchParams(zonderFragment.slice(vraag + 1));
  const tracking = /^(?:utm(?:_.*)?|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;
  const paren: [string, string][] = [];
  params.forEach((waarde, naam) => { if (!tracking.test(naam)) paren.push([naam, waarde]); });
  paren.sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0);
  const query = new URLSearchParams(paren).toString();
  return query ? `${pad}?${query}` : pad;
}
