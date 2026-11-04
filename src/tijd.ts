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
