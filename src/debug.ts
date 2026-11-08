export function debugAan(url: string, opslag?: { getItem: (key: string) => string | null }): boolean {
  const [voor, hash = ""] = url.split("#", 2);
  const query = (s: string) => new URLSearchParams(s.includes("?") ? s.slice(s.indexOf("?") + 1) : "").get("debug") === "1";
  if (query(voor) || query(hash)) return true;
  try { return opslag?.getItem("nieuwsinkort-debug") === "1"; } catch { return false; }
}

export class EventRing {
  private events: string[] = [];
  voegToe(event: string) { this.events.push(event); if (this.events.length > 10) this.events.shift(); }
  lijst() { return [...this.events]; }
  wis() { this.events = []; }
}

export const debug = typeof window !== "undefined" && debugAan(window.location.href, { getItem: (key) => window.localStorage.getItem(key) });
export const videoEvents = new EventRing();
export function debugEvent(event: string) {
  if (debug) videoEvents.voegToe(`${new Date().toLocaleTimeString("nl-NL")} ${event}`);
}
