// Bronnen in tiers (#465): de cron draait elke 5 minuten, maar niet elke bron hoeft zo vaak.
// core (gewone nieuwsfeeds, dumpert, weer): elke run; zwaar (YouTube-feeds, Reddit): elke 15 minuten; social (Instagram, X): elke 30 minuten.
// Overgeslagen bronnen leveren hun laatst gelukte resultaat uit de Runner-opslag, zodat er niets uit de feed verdwijnt.
// Pure logica (geen Cloudflare-imports), getest in tests/tier.test.ts.

export type Tier = "5" | "15" | "30" | "alles";
export type Groep = "core" | "zwaar" | "social";
interface JobLike { url: string; kind: string }
export interface TierCache<R> { at: number; r: R }

/** Tier uit de geplande minuut (UTC); zonder geplande tijd (handmatige /run) draaien alle tiers. */
export function tierVan(gepland?: number): Tier {
  if (gepland === undefined || !Number.isFinite(gepland)) return "alles";
  const min = new Date(gepland).getUTCMinutes();
  return min % 30 === 0 ? "30" : min % 15 === 0 ? "15" : "5";
}

export function jobGroep(j: JobLike): Groep {
  if (j.kind === "insta" || j.kind === "x") return "social";
  if (j.kind === "reddit" || (j.kind === "feed" && /youtube\.com\/feeds\//.test(j.url))) return "zwaar";
  return "core";
}

export function draaitMee(tier: Tier, groep: Groep): boolean {
  return groep === "core" || tier === "alles" || tier === "30" || (tier === "15" && groep === "zwaar");
}

/** Of de YouTube-embedcontroles (zwaar) in deze run mogen. */
export const ytControleMag = (tier: Tier) => draaitMee(tier, "zwaar");

/** Verdeelt jobs: wat nu moet draaien en wat uit de cache komt. Een overgeslagen job zonder verse cache (leeg, van vóór middernacht) draait toch. */
export function verdeelJobs<J extends JobLike, R>(jobs: J[], tier: Tier, cache: Map<string, TierCache<R>>, since: number): { uitvoeren: J[]; uitCache: R[]; overgeslagen: number } {
  const uitvoeren: J[] = [], uitCache: R[] = [];
  for (const j of jobs) {
    const c = cache.get(j.url);
    if (draaitMee(tier, jobGroep(j)) || !c || c.at < since) uitvoeren.push(j);
    else uitCache.push({ ...c.r, cachedAt: c.at } as R);
  }
  return { uitvoeren, uitCache, overgeslagen: uitCache.length };
}
