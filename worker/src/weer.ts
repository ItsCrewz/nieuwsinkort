// Port van /workspace/nieuws/weer.py: Buienradar (dichtstbijzijnde station + 5-daagse), Open-Meteo terugval,
// KNMI weerbericht + waarschuwingen Noord-Holland. Getallen worden nooit verzonnen.
import { decode } from "./parse";
const LAT = 52.38, LON = 4.64;
export const BR_URL = "https://data.buienradar.nl/2.0/feed/json";
export const OM_URL = "https://api.open-meteo.com/v1/forecast?latitude=52.38&longitude=4.64&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code,wind_speed_10m_max,wind_direction_10m_dominant&timezone=Europe%2FAmsterdam&forecast_days=4&wind_speed_unit=ms";
export const KNMI_VERW = "https://www.knmi.nl/nederland-nu/weer/verwachtingen";
export const KNMI_WAARSCH = "https://www.knmi.nl/nederland-nu/weer/waarschuwingen/noord-holland";
const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const WMO: Record<number, string> = { 0: "Zonnig", 1: "Overwegend zonnig", 2: "Half bewolkt", 3: "Bewolkt", 45: "Mist", 48: "Mist", 51: "Motregen", 53: "Motregen", 55: "Motregen", 56: "IJzel", 57: "IJzel", 61: "Lichte regen", 63: "Regen", 65: "Zware regen", 66: "IJzel", 67: "IJzel", 71: "Lichte sneeuw", 73: "Sneeuw", 75: "Zware sneeuw", 77: "Sneeuw", 80: "Buien", 81: "Buien", 82: "Zware buien", 85: "Sneeuwbuien", 86: "Sneeuwbuien", 95: "Onweer", 96: "Onweer met hagel", 99: "Onweer met hagel" };

function pageText(h: string) {
  h = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n");
  return decode(h.replace(/<[^>]+>/g, " ")).replace(/[ \t\u00a0]+/g, " ");
}
export function kort(desc?: string) {
  const d = (desc || "").toLowerCase();
  const rules: [string, string][] = [["onweer", "Onweer"], ["hagel", "Hagel"], ["sneeuw", "Sneeuw"], ["ijzel", "IJzel"], ["motregen", "Motregen"], ["bui", "Buien"], ["regen", "Regen"], ["mist", "Mist"], ["nevel", "Nevel"], ["zwaar bewolkt", "Bewolkt"], ["geheel bewolkt", "Bewolkt"], ["opklaring", "Half bewolkt"], ["half bewolkt", "Half bewolkt"], ["licht bewolkt", "Licht bewolkt"], ["zonnig", "Zonnig"], ["helder", "Helder"], ["bewolkt", "Bewolkt"]];
  for (const [k, v] of rules) if (d.includes(k)) return v;
  return (desc || "").trim();
}
const NAMES = ["N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO", "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW"];
const windrichting = (deg: number) => NAMES[Math.floor((deg % 360) / 22.5 + 0.5) % 16];
function bft(ms: number) { const g = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]; for (let i = 0; i < g.length; i++) if (ms < g[i]) return i; return 12; }
const rond = (x: any) => (x == null || x === "" || !Number.isFinite(+x) ? undefined : Math.floor(+x + 0.5));
const dist = (a: number, b: number, c: number, d: number) => Math.hypot((a - c) * 111, (b - d) * 111 * Math.cos((a * Math.PI) / 180));
function knmiWaarschuwing(t: string) {
  const codes = [...t.matchAll(/[Cc]ode (geel|oranje|rood)/g)].map((m) => m[1]);
  if (!codes.length) return "";
  const ernst: Record<string, number> = { geel: 1, oranje: 2, rood: 3 };
  const z = codes.sort((a, b) => ernst[b] - ernst[a])[0];
  const m = new RegExp(`[Cc]ode ${z}\\s*[:.\\-]?\\s*(.{0,220}?[.!])`).exec(t);
  return `Code ${z}` + (m ? `: ${m[1].trim()}` : "");
}
const clean = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/** bodies: ruwe responses (of null). today = YYYY-MM-DD Amsterdam, hhmm = nu. */
export function buildWeer(br: any, om: any, kv: string | null, kw: string | null, today: string, hhmm: string) {
  const weer: any = { plaats: "Haarlem", bijgewerkt: hhmm };
  const bronnen: { site: string; href: string }[] = [];
  let knmiTekst = "";
  const nu: any = {};
  if (br) {
    const st = (br.actual?.stationmeasurements || []).filter((s: any) => s.temperature != null);
    st.sort((a: any, b: any) => dist(LAT, LON, a.lat, a.lon) - dist(LAT, LON, b.lat, b.lon));
    if (st.length) {
      const s = st[0];
      nu.temp = rond(s.temperature);
      if (s.feeltemperature != null) nu.gevoel = rond(s.feeltemperature);
      if (s.weatherdescription) nu.omschrijving = kort(s.weatherdescription);
      bronnen.push({ site: `Buienradar (${String(s.stationname).replace("Meetstation ", "")})`, href: "https://www.buienradar.nl/weer/haarlem/nl/2754669" });
    }
  }
  if (om?.current) {
    const c = om.current;
    nu.temp ??= rond(c.temperature_2m);
    nu.gevoel ??= rond(c.apparent_temperature);
    if (WMO[c.weather_code]) nu.omschrijving ??= WMO[c.weather_code];
  }
  if (Object.keys(clean(nu)).length) weer.nu = clean(nu);
  const brDays: Record<string, any> = {};
  for (const d of br?.forecast?.fivedayforecast || []) brDays[String(d.day).slice(0, 10)] = d;
  const omDays: Record<string, any> = {};
  if (om?.daily) om.daily.time.forEach((t: string, i: number) => { const o: any = {}; for (const k in om.daily) if (k !== "time") o[k] = om.daily[k][i]; omDays[t] = o; });
  const v: any = {};
  const b = brDays[today], o = omDays[today];
  if (b) {
    v.min = rond(b.mintemperatureMin ?? b.mintemperature);
    v.max = rond(b.maxtemperatureMax ?? b.maxtemperature);
    if (b.rainChance != null) v.neerslagkans = Math.trunc(b.rainChance);
    if (b.wind && b.windDirection) v.wind = `${String(b.windDirection).toUpperCase()} ${Math.trunc(b.wind)} Bft`;
  }
  if (o) {
    if (v.min == null && o.temperature_2m_min != null) v.min = rond(o.temperature_2m_min);
    if (v.max == null && o.temperature_2m_max != null) v.max = rond(o.temperature_2m_max);
    if (v.neerslagkans == null && o.precipitation_probability_max != null) v.neerslagkans = Math.trunc(o.precipitation_probability_max);
    if (!v.wind && o.wind_speed_10m_max != null && o.wind_direction_10m_dominant != null) v.wind = `${windrichting(o.wind_direction_10m_dominant)} ${bft(o.wind_speed_10m_max)} Bft`;
  }
  if (Object.keys(clean(v)).length) weer.vandaag = clean(v);
  const dagen: any[] = [];
  for (const iso of [...new Set([...Object.keys(brDays), ...Object.keys(omDays)])].sort().filter((d) => d > today).slice(0, 3)) {
    const b = brDays[iso], o = omDays[iso];
    const dag: any = { dag: DAGEN[new Date(iso + "T12:00:00Z").getUTCDay()] };
    if (b) { dag.min = rond(b.mintemperatureMin ?? b.mintemperature); dag.max = rond(b.maxtemperatureMax ?? b.maxtemperature); dag.omschrijving = kort(b.weatherdescription); }
    else if (o) { dag.min = rond(o.temperature_2m_min); dag.max = rond(o.temperature_2m_max); dag.omschrijving = WMO[o.weather_code] || ""; }
    const c = clean(dag);
    if (c.min != null && c.max != null) dagen.push(c);
  }
  weer.dagen = dagen;
  if (om && Object.keys(omDays).length) bronnen.push({ site: "Open-Meteo", href: "https://open-meteo.com/en/docs?latitude=52.38&longitude=4.64" });
  let verwachting = "";
  if (kv) {
    const m = /Vandaag & morgen\s*([\s\S]*?)\(Bron: KNMI\)/.exec(pageText(kv));
    if (m) {
      knmiTekst = m[1].replace(/\s+/g, " ").trim().replace(/Waarschuwingen\s+Er zijn geen waarschuwingen\.\s*/, "");
      verwachting = knmiTekst.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").trim();
      bronnen.push({ site: "KNMI", href: KNMI_VERW });
    }
  }
  if (!verwachting && br) {
    const rep = br.forecast?.weatherreport || {};
    const txt = pageText(rep.summary || rep.text || "").replace(/\s+/g, " ").trim();
    if (txt) { knmiTekst = txt; verwachting = txt.split(/(?<=[.!?])\s+/).slice(0, 3).join(" "); }
  }
  weer.verwachting = verwachting;
  let waarschuwing = "";
  if (kw) {
    waarschuwing = knmiWaarschuwing(pageText(kw).replace(/\s+/g, " "));
    if (!bronnen.some((b) => b.site === "KNMI")) bronnen.push({ site: "KNMI", href: KNMI_WAARSCH });
    bronnen.push({ site: "KNMI waarschuwingen", href: KNMI_WAARSCH });
  }
  weer.waarschuwing = waarschuwing;
  weer.bronnen = bronnen;
  return { weer, knmiTekst };
}
