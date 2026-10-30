// Een ongeldige feedlink mag de fallback zonder AI niet onderbreken.
export const hostVan = (h: string): string => { try { return new URL(h).hostname; } catch { return ""; } };
export const isNL = (k: { c: { href: string }[] }): boolean => k.c.some((c) => /\.nl$/.test(hostVan(c.href)));
