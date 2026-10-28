// Bronnenfilter: welke bronnen je wilt zien. Opgeslagen in localStorage, puur client-side.
// Een bericht verdwijnt pas als AL zijn bronnen uit staan; anders tonen we alleen de bronnen die aan staan.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Bron, Data, Item, Video } from "./types";

export type GroupId = "nl" | "tech" | "haarlem" | "showbizz" | "filmpjes" | "dumpert";
export type CatSource = { id: string; naam: string; alias?: string[]; hosts?: string[]; info?: string };
export type Catalog = { gegenereerd?: string; groepen: { id: GroupId; label: string; bronnen: CatSource[] }[] };
export type SourceRow = CatSource & {
  key: string;
  /** aantal verhalen in het overzicht (data.items/filmpjes/dumpert) dat deze bron noemt */
  count: number;
  fromData: boolean;
  /** door de pipeline geteld uit de feed zelf; undefined = geen bronstats in data.json */
  stat?: import("./types").BronStat;
};
export type SourceGroup = { id: GroupId; label: string; sources: SourceRow[]; total: number; published: number | null };

export const GROUP_ORDER: { id: GroupId; label: string }[] = [
  { id: "nl", label: "Nederland" },
  { id: "tech", label: "Tech & AI" },
  { id: "haarlem", label: "Haarlem" },
  { id: "showbizz", label: "Showbizz" },
  { id: "filmpjes", label: "Filmpjes" },
  { id: "dumpert", label: "Dumpert" },
];
const FILTER_KEY = "nieuwsinkort-bronnen-uit";

// Gelijk aan norm() in scripts/build-bronnen.mjs
export const norm = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^de\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

function hostOf(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "").split(".").slice(-2).join(".");
  } catch {
    return "";
  }
}

export function useCatalog() {
  const [cat, setCat] = useState<Catalog | null>(null);
  useEffect(() => {
    fetch("/bronnen.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { groepen: [] }))
      .then((c: Catalog) => setCat(c && Array.isArray(c.groepen) ? c : { groepen: [] }))
      .catch(() => setCat({ groepen: [] }));
  }, []);
  return cat;
}

type Index = Map<GroupId, { byName: Map<string, string>; byHost: Map<string, string>; rows: Map<string, SourceRow> }>;

/** Catalogus + namen uit data.json samenvoegen tot groepen met tellingen. */
export function buildSources(catalog: Catalog | null, data: Data | null): { groups: SourceGroup[]; index: Index } {
  const index: Index = new Map();
  for (const g of GROUP_ORDER) index.set(g.id, { byName: new Map(), byHost: new Map(), rows: new Map() });
  for (const g of catalog?.groepen ?? []) {
    const ix = index.get(g.id);
    if (!ix) continue;
    for (const s of g.bronnen ?? []) {
      const row: SourceRow = { ...s, key: `${g.id}|${s.id}`, count: 0, fromData: false };
      ix.rows.set(s.id, row);
      ix.byName.set(s.id, s.id);
      ix.byName.set(norm(s.naam), s.id);
      for (const a of s.alias ?? []) if (!ix.byName.has(a)) ix.byName.set(a, s.id);
      for (const h of s.hosts ?? []) if (!ix.byHost.has(h)) ix.byHost.set(h, s.id);
    }
  }
  const add = (gid: GroupId, site: string, href: string) => {
    const ix = index.get(gid)!;
    const id = resolveIn(ix, site, href);
    let row = ix.rows.get(id);
    if (!row) {
      row = { id, naam: site || hostOf(href) || "Onbekend", key: `${gid}|${id}`, count: 0, fromData: true };
      ix.rows.set(id, row);
      ix.byName.set(id, id);
    }
    row.count++;
  };
  for (const it of data?.items ?? []) {
    if (!index.has(it.cat as GroupId)) continue;
    // per bericht één keer tellen per bron
    const seen = new Set<string>();
    for (const b of it.bronnen ?? []) {
      const id = resolveIn(index.get(it.cat as GroupId)!, b.site, b.href);
      if (seen.has(id)) continue;
      seen.add(id);
      add(it.cat as GroupId, b.site, b.href);
    }
  }
  for (const v of data?.filmpjes ?? []) add("filmpjes", v.bron, v.href);
  for (const v of data?.dumpert ?? []) add("dumpert", v.bron || "Dumpert", v.href);
  const stats = data?.bronstats;
  if (stats) for (const ix of index.values()) for (const row of ix.rows.values()) if (stats[row.key]) row.stat = stats[row.key];
  const pub = (s: SourceRow) => s.stat?.vandaag ?? -1;
  const groups: SourceGroup[] = GROUP_ORDER.map((g) => {
    const sources = [...index.get(g.id)!.rows.values()].sort(
      (a, b) => b.count - a.count || pub(b) - pub(a) || a.naam.localeCompare(b.naam, "nl", { sensitivity: "base" })
    );
    return {
      ...g,
      sources,
      total: sources.reduce((n, s) => n + s.count, 0),
      published: stats ? sources.reduce((n, s) => n + (s.stat?.vandaag ?? 0), 0) : null,
    };
  }).filter((g) => g.sources.length > 0);
  return { groups, index };
}

function resolveIn(ix: { byName: Map<string, string>; byHost: Map<string, string> }, site: string, href: string) {
  const n = norm(site);
  const byName = n ? ix.byName.get(n) : undefined;
  if (byName) return byName;
  // "X (@NHNieuws)" -> NH Nieuws: probeer de handle als naam
  const xh = /^x\s*\(@([a-z0-9_]+)\)$/i.exec(String(site || "").trim());
  const byHandle = xh ? ix.byName.get(norm(xh[1])) : undefined;
  if (byHandle) return byHandle;
  const h = hostOf(href);
  const byHost = h ? ix.byHost.get(h) : undefined;
  if (byHost && !n) return byHost;
  // Onbekende naam: alleen naar host terugvallen als de naam op die host lijkt (bijv. "NOS" ~ nos.nl)
  if (byHost && h.replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]/g, "") === n) return byHost;
  return n || h || "onbekend";
}

export function sourceKey(index: Index, gid: GroupId, site: string, href: string) {
  const ix = index.get(gid);
  return `${gid}|${ix ? resolveIn(ix, site, href) : norm(site)}`;
}

function readOff(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTER_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function useSourceFilter() {
  const [off, setOff] = useState<Set<string>>(readOff);
  const persist = (s: Set<string>) => {
    try {
      if (s.size) localStorage.setItem(FILTER_KEY, JSON.stringify([...s]));
      else localStorage.removeItem(FILTER_KEY);
    } catch {
      /* negeer */
    }
  };
  const setMany = useCallback((keys: string[], on: boolean) => {
    setOff((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.delete(k);
        else next.add(k);
      }
      persist(next);
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    setOff(new Set());
    persist(new Set());
  }, []);
  // andere tabbladen bijhouden
  useEffect(() => {
    const on = (e: StorageEvent) => e.key === FILTER_KEY && setOff(readOff());
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);
  return { off, setMany, reset };
}

/** Data met de filter toegepast. Berichten zonder bronnen blijven altijd zichtbaar. */
export function useFiltered(data: Data | null, index: Index, off: Set<string>) {
  return useMemo(() => {
    if (!data) return null;
    if (off.size === 0) return { data, hidden: 0 };
    let hidden = 0;
    const items: Item[] = [];
    for (const it of data.items) {
      const bronnen = it.bronnen ?? [];
      if (!bronnen.length || !index.has(it.cat as GroupId)) {
        items.push(it);
        continue;
      }
      const active: Bron[] = bronnen.filter((b) => !off.has(sourceKey(index, it.cat as GroupId, b.site, b.href)));
      if (active.length === 0) hidden++;
      else items.push(active.length === bronnen.length ? it : { ...it, bronnen: active });
    }
    const vid = (list: Video[], gid: GroupId) =>
      list.filter((v) => {
        const keep = !off.has(sourceKey(index, gid, v.bron || (gid === "dumpert" ? "Dumpert" : ""), v.href));
        if (!keep) hidden++;
        return keep;
      });
    return { data: { ...data, items, filmpjes: vid(data.filmpjes, "filmpjes"), dumpert: vid(data.dumpert, "dumpert") }, hidden };
  }, [data, index, off]);
}
