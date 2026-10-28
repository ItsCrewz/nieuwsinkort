// Video-samenvattingen vooraf maken, zodat het onderblad "Samenvatting" meteen klaar is.
// Draait als alarm van de Runner-DO ná de uurrun (het uurnieuws gaat dus altijd voor) en roept per filmpje
// de Pages Function /samenvatting aan met pre:true. Die bewaakt het gedeelde dagbudget (max 85%, 600 marge,
// boven 70% klein model + korter luisteren) en bewaart de uitkomst in KV (vs:<id>).
// Volgorde: wat bovenaan staat eerst, om en om Shorts / Journaals / Dumpert; goedkope YouTube-ondertiteling vóór
// Whisper. Per alarm hooguit MAX_CALLS verzoeken (free plan: 50 subrequests) en PER_ALARM neuronen; daarna
// eventueel een volgend alarm (max 3 per uur) zodat het werk over het uur verspreid wordt.
import { videoSlug } from "../../src/slug";
import { soortVan } from "./videos";

const MAX_CALLS = 30;
const PER_ALARM_MS = 8 * 60e3;
export const MAX_ALARMS_PER_UUR = 3;

type V = { titel: string; href: string; embed?: string; bron?: string; soort?: string };
const isYT = (v: V) => /youtube\.com|youtu\.be/.test(`${v.embed || ""} ${v.href}`);

/** Filmpjes in de volgorde waarin de site ze toont (eerste kaart van elke feed eerst). */
export function volgorde(d: any): V[] {
  const f: V[] = (d?.filmpjes || []).map((v: V) => ({ ...v, soort: soortVan(v) }));
  const feeds = [f.filter((v) => v.soort !== "journaal"), f.filter((v) => v.soort === "journaal"), (d?.dumpert || []) as V[]];
  const out: V[] = [], gezien = new Set<string>();
  for (let i = 0; feeds.some((l) => i < l.length); i++)
    for (const l of feeds) { const v = l[i]; if (v?.href && !gezien.has(videoSlug(v as any))) { gezien.add(videoSlug(v as any)); out.push(v); } }
  // goedkoop eerst (ondertiteling ±5 neuronen), daarna Whisper (±45–140); binnen elk: feedvolgorde
  return [...out.filter(isYT), ...out.filter((v) => !isYT(v))];
}

export async function vooraf(env: { NIEUWS: KVNamespace; SITE: string; BUDGET?: string }, perAlarm: number) {
  const T0 = Date.now();
  const d: any = await (await fetch(`${env.SITE}/data.json?vooraf=${T0}`, { signal: AbortSignal.timeout(15000) })).json();
  const lijst = volgorde(d);
  const ids = lijst.map((v) => videoSlug(v as any));
  const cache = await Promise.all(ids.map((id) => env.NIEUWS.get(`vs:${id}`, "json").catch(() => null)));
  const todo = lijst.map((v, i) => ({ v, id: ids[i] })).filter((_, i) => !cache[i]);
  let neur = 0, calls = 0, gemaakt = 0, stop = "";
  const fouten: string[] = [];
  let ytDicht = false; // YouTube weigert ondertiteling: rest van YouTube dit alarm overslaan
  for (const { id } of todo) {
    if (ytDicht && id.startsWith("yt-")) continue;
    if (calls >= MAX_CALLS) { stop = "max-verzoeken"; break; }
    if (neur >= perAlarm) { stop = "run-budget"; break; }
    if (Date.now() - T0 > PER_ALARM_MS) { stop = "tijd"; break; }
    calls++;
    try {
      const r = await fetch(`${env.SITE}/samenvatting`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "nieuwsinkort-uur/vooraf" }, body: JSON.stringify({ id, pre: true }), signal: AbortSignal.timeout(90000) });
      const j: any = await r.json().catch(() => ({}));
      neur += +j.neuronen || 0;
      if (j.ok) { gemaakt++; cache[ids.indexOf(id)] = j; }
      else if (j.code === "budget-pre" || j.code === "budget") { stop = "dagbudget"; break; }
      else if (j.code !== "bezig") { fouten.push(`${id}: ${j.code}`); if (j.code === "geblokkeerd" && id.startsWith("yt-")) ytDicht = true; }
    } catch (e: any) { fouten.push(`${id}: ${String(e?.message || e).slice(0, 40)}`); }
  }
  // klaar-lijst voor /data.json: punten van alle getoonde filmpjes met een samenvatting (1 KV-write per alarm)
  const klaar: Record<string, any> = {};
  ids.forEach((id, i) => { const c: any = cache[i]; if (c?.ok) klaar[id] = { punten: c.punten, bron: c.bron, sec: c.sec || 0 }; });
  await env.NIEUWS.put("sv-klaar", JSON.stringify({ at: new Date().toISOString(), klaar }), { expirationTtl: 2 * 86400 });
  const rest = todo.length - calls;
  return { totaal: ids.length, klaar: Object.keys(klaar).length, nogTeDoen: rest, verzoeken: calls, gemaakt, neuronen: Math.round(neur), stop, fouten: fouten.slice(0, 10), ms: Date.now() - T0 };
}
