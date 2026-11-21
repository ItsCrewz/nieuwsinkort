// Feedlinks controleren vóór ophalen of doorsturen naar Jina.
export function externeUrl(h: string): string | null {
  try {
    const u = new URL(h);
    const host = u.hostname.replace(/\.$/, "");
    if (!/^https?:$/.test(u.protocol) || (u.port && u.port !== "80" && u.port !== "443")) return null;
    if (/^(localhost|.*\.localhost|local|.*\.local|internal|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(host)) return null;
    return u.toString();
  } catch { return null; }
}

// Controleer elk redirectdoel vóór het ophalen; de timeout geldt voor de hele keten.
export async function externeFetch(url: string, init: RequestInit): Promise<Response> {
  let h = externeUrl(url);
  if (!h) throw new Error("geweigerde externe URL");
  const bezocht = new Set<string>();
  for (let hops = 0; ; hops++) {
    bezocht.add(h);
    const r = await fetch(h, { ...init, redirect: "manual" });
    if (!externeUrl(r.url || h)) {
      await r.body?.cancel().catch(() => {});
      throw new Error("geweigerde redirect-URL");
    }
    if (![301, 302, 303, 307, 308].includes(r.status)) return r;
    const locatie = r.headers.get("location");
    await r.body?.cancel().catch(() => {});
    let doel: string | null = null;
    try { if (locatie?.trim()) doel = externeUrl(new URL(locatie, h).toString()); } catch { /* ongeldige Location */ }
    if (!doel) throw new Error("geweigerde redirect-URL");
    if (hops >= 10 || bezocht.has(doel)) throw new Error("te veel redirects of redirectlus");
    h = doel;
  }
}
