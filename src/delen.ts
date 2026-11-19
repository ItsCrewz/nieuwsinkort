import { artikelPad } from "./artikelid";
// Lege string = dit bericht heeft geen eigen link (geen id en geen bron); delen is dan uitgeschakeld.
export const artikelUrl = (item: Parameters<typeof artikelPad>[0], dag: string) => { const pad = artikelPad(item, dag); return pad ? `https://nieuwsinkort.nl${pad}` : ""; };
type DeelNavigator = { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean; clipboard?: { writeText: (tekst: string) => Promise<void> } };
export const KLEMBORD_MS = 2000;
export async function deel(navigator: DeelNavigator, titel: string, url: string, klembordMs = KLEMBORD_MS): Promise<"gedeeld" | "gekopieerd" | "handmatig" | "geannuleerd"> {
  // Dezelfde gegevens controleren als aan share() worden aangeboden.
  const data: ShareData = { title: titel, url };
  let kanDelen = false;
  try { kanDelen = !!navigator.share && (!navigator.canShare || navigator.canShare(data)); } catch { /* Probeer kopiëren. */ }
  if (kanDelen && navigator.share) {
    try { await navigator.share(data); return "gedeeld"; } catch (e) { if (e instanceof Error && e.name === "AbortError") return "geannuleerd"; }
  }
  // Een klembord dat nooit antwoordt mag de handmatige terugval niet blokkeren: na KLEMBORD_MS geven we op.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!navigator.clipboard) throw new Error();
    const poging = navigator.clipboard.writeText(url);
    poging.catch(() => {}); // Een late afwijzing na de time-out is geen unhandled rejection.
    const tijd = new Promise<never>((_, nee) => { timer = setTimeout(() => nee(new Error("klembord")), klembordMs); });
    await Promise.race([poging, tijd]);
    return "gekopieerd";
  } catch { return "handmatig"; } finally { clearTimeout(timer); }
}
