import { chat, type Usage } from "./ai";

export type TabArtikel = { cat: string; kop: string; ai?: string };
export type TabSam = { tekst: string; ai: boolean; bron: string; gegenereerd: string };
type KV = { get(key: string): Promise<string | null>; put(key: string, value: string, opts: { expirationTtl: number }): Promise<unknown> };

export function tabAiRoute(tier: number, beperkt: boolean, tijdelijk: boolean, cloudflare: boolean, extern: boolean): "cloudflare" | "extern" | "geen" {
  if (tijdelijk) return "geen";
  if (tier >= 3 || beperkt || !cloudflare) return extern ? "extern" : "geen";
  return "cloudflare";
}

export async function tabSleutel(tab: string, items: TabArtikel[]): Promise<string> {
  const inhoud = items.map((i) => JSON.stringify([i.cat, i.kop, i.ai || ""])).sort().join("\n");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inhoud));
  return `tabsam:${tab}:${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function maakTabSam(kv: KV, tab: string, items: TabArtikel[], now: number, maak?: () => Promise<{ tekst: string; bron: string }>): Promise<{ sam: TabSam; geschreven: boolean }> {
  const hash = await tabSleutel(tab, items);
  const key = `tabsam:${tab}:laatste`;
  try {
    const cached = JSON.parse(await kv.get(key) || "null");
    const leeftijd = now - Date.parse(cached?.sam?.gegenereerd);
    if (cached?.sam?.tekst && cached.sam.ai === true && leeftijd >= 0 && (cached.hash === hash || leeftijd < 6 * 3600e3)) return { sam: cached.sam, geschreven: false };
  } catch { /* zonder cache verder */ }
  let tekst = "", bron = "extractief";
  if (maak) try { ({ tekst, bron } = await maak()); } catch { /* extractieve terugval */ }
  const ai = !!tekst;
  if (!tekst) tekst = items.slice(0, 3).map((i) => (i.ai || i.kop).trim().split(/(?<=[.!?])\s/)[0].slice(0, 160).replace(/[.!?…]*$/, ".")).join(" ");
  const sam = { tekst, ai, bron, gegenereerd: new Date(now).toISOString() };
  // Extractieve tekst niet cachen: bij een volgende run mag AI opnieuw proberen.
  if (ai) try { await kv.put(key, JSON.stringify({ hash, sam }), { expirationTtl: 7 * 86400 }); return { sam, geschreven: true }; } catch { console.error("KV-schrijffout tabsamenvatting"); }
  return { sam, geschreven: false };
}

export async function tabTekst(ai: Ai, model: string, items: TabArtikel[], usage: Usage): Promise<string> {
  const regels = items.slice(0, 10).map((i) => `${i.kop.slice(0, 100)}: ${(i.ai || "").slice(0, 140)}`).join("\n");
  return (await chat(ai, model, "Schrijf in eenvoudig Nederlands op B1-niveau. Gebruik korte zinnen en gewone woorden. Gebruik alleen feiten uit de berichten. Geef geen kop of opsomming.", `Geef een overzicht van deze berichten in 2 tot 4 korte zinnen.\n${regels}`, 180, usage)).replace(/\s+/g, " ").trim();
}
