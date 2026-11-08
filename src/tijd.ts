// Amsterdamse kalenderdag, gedeeld door frontend en Worker.
const TZ = "Europe/Amsterdam";
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export function ams(t = Date.now()) {
  const p = Object.fromEntries(formatter.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, iso: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}
export function midnight(t = Date.now()) {
  const a = ams(t);
  const off = Date.UTC(a.y, a.m - 1, a.d, a.h, a.min, a.s) - Math.floor(t / 1000) * 1000;
  const dag = Date.UTC(a.y, a.m - 1, a.d);
  let guess = dag - off;
  const a2 = ams(guess);
  // Op wisseldagen kan de offset om middernacht afwijken van die op het kijkmoment.
  if (a2.h !== 0 || a2.d !== a.d) {
    guess -= Date.UTC(a2.y, a2.m - 1, a2.d, a2.h, a2.min) - dag;
  }
  return guess;
}
// Tijdstip van h:min op de Amsterdamse dag van t; null als die kloktijd niet bestaat, bij dubbele tijd de eerste.
export function amsTijdstip(t: number, h: number, min: number): number | null {
  const iso = ams(t).iso, basis = midnight(t) + (h * 60 + min) * 60e3;
  for (const c of [basis - 3600e3, basis, basis + 3600e3]) {
    const a = ams(c);
    if (a.iso === iso && a.h === h && a.min === min) return c;
  }
  return null;
}

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MO = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function dayDates(dagen: { dag?: string }[], t = Date.now()) {
  const a = ams(t);
  const cur = new Date(Date.UTC(a.y, a.m - 1, a.d));
  return dagen.map(({ dag }) => {
    const want = WD.indexOf((dag || "").slice(0, 2).toLowerCase());
    if (want < 0) return "";
    do { cur.setUTCDate(cur.getUTCDate() + 1); } while (cur.getUTCDay() !== want);
    return `${cur.getUTCDate()} ${MO[cur.getUTCMonth()]}`;
  });
}
