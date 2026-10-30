// Landelijk weerbericht (heel Nederland): Buienradar (alle landstations + landelijke 5-daagse), Open-Meteo terugval
// (Groningen, De Bilt, Maastricht in één verzoek), KNMI landelijk weerbericht en landelijke waarschuwingsregel
// (zelfde pagina, dus geen extra verzoek). Getallen worden nooit verzonnen; ontbrekende bron = veld weg.
import { decode } from "./parse";
export const BR_URL = "https://data.buienradar.nl/2.0/feed/json";
export const OM_URL = "https://api.open-meteo.com/v1/forecast?latitude=53.22,52.10,50.85&longitude=6.57,5.18,5.69&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code,wind_speed_10m_max,wind_direction_10m_dominant&timezone=Europe%2FAmsterdam&forecast_days=4&wind_speed_unit=ms";
export const KNMI_VERW = "https://www.knmi.nl/nederland-nu/weer/verwachtingen";
export const KNMI_WAARSCH = "https://www.knmi.nl/nederland-nu/weer/waarschuwingen";
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
const mediaan = (a: number[]) => { const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const ernst: Record<string, number> = { geel: 1, oranje: 2, rood: 3 };
// Landelijke waarschuwingsregel uit het KNMI-weerbericht ("Waarschuwingen\n<regel(s) met (code geel)>"); de ergste code wint.
function knmiWaarschuwing(t: string) {
  const blok = /Waarschuwingen[ \t]*\n\s*([\s\S]*?)(?:\n\s*\n|$)/.exec(t)?.[1] || "";
  let beste = "", z = "";
  for (const r of blok.split("\n")) {
    const c = /\(?\bcode (geel|oranje|rood)\b\)?/i.exec(r)?.[1].toLowerCase();
    if (c && (!z || ernst[c] > ernst[z])) { z = c; beste = r.replace(/\s*\(?\bcode (geel|oranje|rood)\b\)?/i, "").replace(/\s+([.!])/g, "$1").trim(); }
  }
  return z ? `Code ${z}: ${beste}`.slice(0, 260) : "";
}
const clean = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/** bodies: ruwe responses (of null). today = YYYY-MM-DD Amsterdam, hhmm = nu. */
export function buildWeer(br: any, om: any, kv: string | null, today: string, hhmm: string) {
  const weer: any = { plaats: "Nederland", bijgewerkt: hhmm };
  const bronnen: { site: string; href: string }[] = [];
  let knmiTekst = "";
  const nu: any = {};
  if (br) {
    // landstations met een geldige meting (geen Noordzee-platforms): mediaan = landelijke temperatuur, bereik = koudste–warmste
    const st = (br.actual?.stationmeasurements || []).filter((s: any) => s.temperature != null && Number.isFinite(+s.temperature) && s.regio !== "Noordzee");
    if (st.length) {
      const t = st.map((s: any) => +s.temperature), g = st.filter((s: any) => s.feeltemperature != null && Number.isFinite(+s.feeltemperature)).map((s: any) => +s.feeltemperature);
      nu.temp = rond(mediaan(t));
      if (g.length) nu.gevoel = rond(mediaan(g));
      if (st.length > 1) { nu.van = rond(Math.min(...t)); nu.tot = rond(Math.max(...t)); }
      // meest voorkomende weersomschrijving
      const tel: Record<string, number> = {};
      for (const s of st) if (s.weatherdescription) { const k = kort(s.weatherdescription); tel[k] = (tel[k] || 0) + 1; }
      const top = Object.entries(tel).sort((a, b) => b[1] - a[1])[0];
      if (top) nu.omschrijving = top[0];
      bronnen.push({ site: "Buienradar", href: "https://www.buienradar.nl/weer/nederland" });
    }
  }
  // Open-Meteo: meerdere punten (noord/midden/zuid) geven een array; één punt een object
  const oms: any[] = (Array.isArray(om) ? om : om ? [om] : []).filter((x) => x && typeof x === "object");
  const cur = oms.map((x) => x.current).filter(Boolean);
  if (cur.length) {
    const num = (k: string) => cur.map((c) => c[k]).filter((x) => x != null && Number.isFinite(+x)).map(Number);
    const t = num("temperature_2m"), g = num("apparent_temperature");
    if (t.length) nu.temp ??= rond(mediaan(t));
    if (g.length) nu.gevoel ??= rond(mediaan(g));
    if (t.length > 1) { nu.van ??= rond(Math.min(...t)); nu.tot ??= rond(Math.max(...t)); }
    const w = WMO[(cur[1] ?? cur[0]).weather_code];
    if (w) nu.omschrijving ??= w;
  }
  if (Object.keys(clean(nu)).length) weer.nu = clean(nu);
  const brDays: Record<string, any> = {};
  for (const d of br?.forecast?.fivedayforecast || []) brDays[String(d.day).slice(0, 10)] = d;
  // per dag over alle punten: laagste min, hoogste max en hoogste neerslagkans/wind; weercode en windrichting van het middelste punt
  const omDays: Record<string, any> = {};
  const dl = oms.filter((x) => x.daily?.time);
  if (dl.length) dl[0].daily.time.forEach((t: string, i: number) => {
    const rij = dl.map((x) => { const o: any = {}; for (const k in x.daily) if (k !== "time") o[k] = x.daily[k][i]; return o; });
    const waarden = (k: string) => rij.map((o) => o[k]).filter((x) => x != null && Number.isFinite(+x)).map(Number);
    const mn = waarden("temperature_2m_min"), mx = waarden("temperature_2m_max"), pk = waarden("precipitation_probability_max"), ws = waarden("wind_speed_10m_max");
    const mid = rij[1] ?? rij[0];
    const o: any = { weather_code: mid.weather_code };
    if (mn.length) o.temperature_2m_min = Math.min(...mn);
    if (mx.length) o.temperature_2m_max = Math.max(...mx);
    if (pk.length) o.precipitation_probability_max = Math.max(...pk);
    if (ws.length) { o.wind_speed_10m_max = Math.max(...ws); o.wind_direction_10m_dominant = rij[ws.indexOf(Math.max(...ws))]?.wind_direction_10m_dominant ?? mid.wind_direction_10m_dominant; }
    omDays[t] = o;
  });
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
  if (Object.keys(omDays).length) bronnen.push({ site: "Open-Meteo", href: "https://open-meteo.com/en/docs" });
  let verwachting = "", waarschuwing = "";
  if (kv) {
    const m = /Vandaag & morgen\s*([\s\S]*?)\(Bron: KNMI\)/.exec(pageText(kv));
    if (m) {
      waarschuwing = knmiWaarschuwing(m[1]);
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
  if (waarschuwing) bronnen.push({ site: "KNMI waarschuwingen", href: KNMI_WAARSCH });
  weer.waarschuwing = waarschuwing;
  weer.bronnen = bronnen;
  return { weer, knmiTekst };
}
