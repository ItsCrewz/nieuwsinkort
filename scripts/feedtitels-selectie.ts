import { isBuitenland } from "../src/regio";

const NEWS = new Set(["nl", "buitenland", "haarlem", "tech", "politiek", "voetbal", "f1", "auto"]);

export function geselecteerd(cat: string): boolean {
  return NEWS.has(cat);
}

export function nieuwsRubriek(cat: string, feed: string, href: string, titel: string, beschrijving: string): string {
  return cat === "nl" && isBuitenland({ kop: titel, ai: beschrijving, bronnen: [{ href, buitenFeed: /buitenland/i.test(feed) }] }) ? "buitenland" : cat;
}
