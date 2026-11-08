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

// Automatisch gevolgde redirects mogen alleen een toegestane eind-URL opleveren.
export async function externeFetch(url: string, init: RequestInit): Promise<Response> {
  const h = externeUrl(url);
  if (!h) throw new Error("geweigerde externe URL");
  const r = await fetch(h, { ...init, redirect: "follow" });
  if (!externeUrl(r.url || h)) {
    await r.body?.cancel().catch(() => {});
    throw new Error("geweigerde redirect-URL");
  }
  return r;
}
