import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Bron, Cat, Data, Item, View, Weer, WeerDag } from "./types";
import { BionicText, FocusSwitch, host } from "./ui";
import { buildSources, useCatalog, useFiltered, useSourceFilter } from "./sources";
import { SourcesSheet } from "./sheet";
import { Icon, IconSprite, type IconName } from "./icons";
import { VideoGrid } from "./video";
import { videoSlug } from "./feed";

const CATS: { id: Cat; label: string; slug: string }[] = [
  { id: "nl", label: "Nederland", slug: "nederland" },
  { id: "tech", label: "Tech & AI", slug: "tech" },
  { id: "haarlem", label: "Haarlem", slug: "haarlem" },
  { id: "showbizz", label: "Showbizz", slug: "showbizz" },
];
const CAT_LABEL: Record<Cat, string> = { nl: "Nederland", tech: "Tech & AI", haarlem: "Haarlem", showbizz: "Showbizz" };
const ALLES_FIRST = 24; // op "Alles" eerst zoveel kaarten, daarna "Toon alle"
const BIONIC_KEY = "dagelijks-nieuws-focus-lezen-v2";
const THEME_KEY = "nieuwsinkort-thema";
let openedInside = false;
// feed geopend vanuit het overzicht (dan is sluiten = history.back())
let feedPushed = false;
// Intro-animatie alleen bij de eerste keer laden; daarna (tabwissel, herladen) niet opnieuw.
let introDone = false;

// ---------------------------------------------------------------- helpers
function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
const itemKey = (i: Item) => slugify(i.kop) || i.bronnen?.[0]?.href || i.kop;

function bronLabel(bronnen: Bron[]) {
  const names: string[] = [];
  for (const b of bronnen ?? []) if (!names.includes(b.site)) names.push(b.site);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1}`;
}
const bronnenTekst = (n: number) => `${n} ${n === 1 ? "bron" : "bronnen"}`;

const motionOK = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function amsterdamTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(d);
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---- routing via hash: #/nederland, #/filmpjes, #/bericht/<slug>
type Route = { view: View; selected: string | null; video: string | null };
function parseHash(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
  if (h.startsWith("bericht/")) return { view: "alles", selected: h.slice(8), video: null };
  const c = CATS.find((c) => c.slug === h);
  if (c) return { view: c.id, selected: null, video: null };
  const m = /^(filmpjes|dumpert)(?:\/(.+))?$/.exec(h);
  if (m) return { view: m[1] as View, selected: null, video: m[2] || null };
  return { view: "alles", selected: null, video: null };
}
function viewHash(v: View) {
  if (v === "alles") return "#/";
  const c = CATS.find((c) => c.id === v);
  return `#/${c ? c.slug : v}`;
}

// ---------------------------------------------------------------- weer
type Kind = "sun" | "rain" | "partly" | "cloud";
function weatherKind(s?: string): Kind {
  const t = (s || "").toLowerCase();
  if (/half|wisselend|opklaring|zon en wolk|licht bewolkt|af en toe zon/.test(t)) return "partly";
  if (/regen|bui|motregen|onweer|hagel|sneeuw|natte/.test(t)) return "rain";
  if (/zon|helder|onbewolkt/.test(t)) return "sun";
  return "cloud";
}
const KIND_CLASS: Record<Kind, string> = { sun: "ic-sun", rain: "ic-rain", partly: "ic-partly", cloud: "" };
const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MO = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function dayDates(dagen: WeerDag[]) {
  // koppel "do", "vr"… aan de eerstvolgende datums (vanaf morgen)
  const out: string[] = [];
  const cur = new Date();
  for (const d of dagen) {
    const want = WD.indexOf((d.dag || "").slice(0, 2).toLowerCase());
    if (want < 0) {
      out.push("");
      continue;
    }
    for (let k = 0; k < 8; k++) {
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() === want) break;
    }
    out.push(`${cur.getDate()} ${MO[cur.getMonth()]}`);
  }
  return out;
}

function WarnBanner({ text }: { text: string }) {
  const t = text.toLowerCase();
  const lvl = t.includes("rood") ? "lvl-rood" : t.includes("oranje") ? "lvl-oranje" : "";
  const m = /^(.{0,80}?[.:])\s+(.*)$/s.exec(text);
  return (
    <div className={`alert ${lvl}`} role="status">
      <Icon name="alert" className="sm" />
      <div>{m ? <><strong>{m[1]}</strong> {m[2]}</> : <strong>{text}</strong>}</div>
    </div>
  );
}

function WeatherBox({ W, bionic }: { W?: Weer; bionic: boolean }) {
  const nu = W?.nu ?? {};
  const vd = W?.vandaag ?? {};
  const dagen = (W?.dagen ?? []).filter((d) => d && (typeof d.min === "number" || typeof d.max === "number"));
  const heeftNu = typeof nu.temp === "number";
  const stats: { k: string; v: string }[] = [];
  if (typeof vd.min === "number" || typeof vd.max === "number")
    stats.push({ k: "Vandaag", v: `${typeof vd.min === "number" ? `${vd.min}°` : "–"} / ${typeof vd.max === "number" ? `${vd.max}°` : "–"}` });
  if (typeof vd.neerslagkans === "number") stats.push({ k: "Neerslag", v: `${vd.neerslagkans}%` });
  if (vd.wind) stats.push({ k: "Wind", v: vd.wind });
  const leeg = !W || (!heeftNu && stats.length === 0 && !W.verwachting && dagen.length === 0 && !W.waarschuwing);
  const plaats = W?.plaats || "Haarlem";
  const kind = weatherKind(nu.omschrijving);
  const dates = dayDates(dagen.slice(0, 4));
  return (
    <section className="wx" aria-label={`Weer in ${plaats}`}>
      <div className="wx-head">
        <h2 className="kicker">Weer · {plaats}</h2>
        {W?.bijgewerkt ? <span className="wx-upd tnum">{W.bijgewerkt}</span> : null}
      </div>
      {W?.waarschuwing ? <WarnBanner text={W.waarschuwing} /> : null}
      {leeg ? (
        <p className="wx-empty">Het weerbericht is er nu even niet. Kom straks nog eens kijken.</p>
      ) : (
        <>
          {heeftNu ? (
            <div className="wx-now">
              <span className="wx-temp tnum">{nu.temp}°</span>
              <div className="wx-cond">
                <Icon name={kind as IconName} className={`wx-icon ${KIND_CLASS[kind]}`} />
                <span>
                  {nu.omschrijving || ""}
                  {typeof nu.gevoel === "number" ? (
                    <>
                      <br />
                      <span className="muted">voelt als {nu.gevoel}°</span>
                    </>
                  ) : null}
                </span>
              </div>
            </div>
          ) : null}
          {W?.verwachting ? (
            <p className="wx-text bn">
              <BionicText text={W.verwachting} on={bionic} />
            </p>
          ) : null}
          {stats.length ? (
            <dl className="wx-stats">
              {stats.map((s) => (
                <div key={s.k}>
                  <dt>{s.k}</dt>
                  <dd className="tnum">{s.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {dagen.length ? (
            <ol className="wx-days" style={{ gridTemplateColumns: `repeat(${Math.min(dagen.length, 4)},minmax(0,1fr))` }}>
              {dagen.slice(0, 4).map((d, i) => {
                const k = weatherKind(d.omschrijving);
                const label = d.omschrijving || { sun: "Zonnig", rain: "Regen", partly: "Half bewolkt", cloud: "Bewolkt" }[k];
                return (
                  <li className="day" key={d.dag + i} title={label}>
                    <span className="dn">{cap(d.dag)}</span>
                    <span className="dd tnum">{dates[i] || ""}</span>
                    <Icon name={k} className={KIND_CLASS[k]} label={label} />
                    <span className="hl tnum">
                      <b>{typeof d.max === "number" ? `${d.max}°` : "–"}</b> {typeof d.min === "number" ? `${d.min}°` : "–"}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      )}
      {W?.bronnen?.length ? (
        <div className="wx-src">
          Bron:{" "}
          {W.bronnen.map((b, i) => (
            <span key={b.href}>
              {i ? ", " : ""}
              <a href={b.href} target="_blank" rel="noreferrer">
                {b.site}
              </a>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Briefing({ text, bionic, sources, time }: { text: string; bionic: boolean; sources: number; time: string }) {
  return (
    <section className="brief" aria-label="In het kort">
      <h2 className="kicker accent">In het kort</h2>
      {text ? (
        <p className="brief-text bn">
          <BionicText text={text} on={bionic} />
        </p>
      ) : (
        <p className="brief-text muted">De samenvatting van vandaag komt er zo aan.</p>
      )}
      {sources > 0 ? (
        <p className="brief-meta">
          Samengevat uit {bronnenTekst(sources)}
          {time ? <> · <span className="tnum">{time}</span></> : null}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- tabs
function Tabs({ data, view, onChange }: { data: Data; view: View; onChange: (v: View) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  const options: { value: View; id: string; label: string; count: number }[] = [
    { value: "alles", id: "all", label: "Alles", count: data.items.length },
    ...CATS.map((c) => ({ value: c.id as View, id: c.id, label: c.label, count: data.items.filter((i) => i.cat === c.id).length })),
    { value: "filmpjes", id: "filmpjes", label: "Filmpjes", count: data.filmpjes.length },
    { value: "dumpert", id: "dumpert", label: "Dumpert", count: data.dumpert.length },
  ];
  // Indicator alleen via transform (translateX + scaleX op een 100px-balk): loopt op de compositor, ook op 120 Hz.
  const place = useCallback((sel: HTMLElement | null, instant = false) => {
    const list = listRef.current;
    const ind = indRef.current;
    if (!list || !ind || !sel) return;
    if (instant) ind.style.transition = "none";
    ind.style.transform = `translate3d(${sel.offsetLeft}px,0,0) scaleX(${sel.offsetWidth / 100})`;
    if (instant) {
      void ind.offsetWidth;
      ind.style.transition = "";
    }
    ind.classList.add("ready");
    if (list.scrollWidth > list.clientWidth) {
      const left = Math.max(0, sel.offsetLeft - (list.clientWidth - sel.offsetWidth) / 2);
      list.scrollTo({ left, behavior: instant || !motionOK() ? "auto" : "smooth" });
    }
  }, []);
  const measure = useCallback(
    (instant = false) => place(listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null, instant),
    [place]
  );
  useLayoutEffect(() => {
    measure(first.current);
    first.current = false;
  }, [view, measure]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => measure(true));
    ro.observe(list);
    document.fonts?.ready.then(() => measure(true)).catch(() => {});
    return () => ro.disconnect();
  }, [measure]);
  return (
    <nav className="tabs" aria-label="Rubrieken">
      <div className="tablist" role="tablist" ref={listRef}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`tab cat-${o.id}`}
            role="tab"
            aria-selected={view === o.value}
            onClick={(e) => {
              place(e.currentTarget); // meteen bewegen, de inhoud volgt
              onChange(o.value);
            }}
          >
            {o.id !== "all" ? <i className="mk" /> : null}
            {o.label}
            <span className="tcount tnum">{o.count}</span>
          </button>
        ))}
        <span className="ind" ref={indRef} aria-hidden="true" />
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- nieuws
function sortItems(items: Item[]) {
  return items.slice().sort((a, b) => {
    if (!a.tijd !== !b.tijd) return a.tijd ? -1 : 1;
    return a.tijd < b.tijd ? 1 : a.tijd > b.tijd ? -1 : 0;
  });
}
// Openingsverhaal: het bericht met de meeste bronnen (meest gedekt), bij gelijkspel het nieuwste.
function pickLead(sorted: Item[]) {
  let best = -1;
  let n = -1;
  sorted.forEach((it, i) => {
    const c = new Set((it.bronnen ?? []).map((b) => b.site)).size;
    if (c > n) {
      n = c;
      best = i;
    }
  });
  return best;
}

type OpenFn = (k: string) => void;
function useOpen(key: string, onOpen: OpenFn) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(key);
  };
}

const LeadStory = memo(function LeadStory({ item, bionic, enter, onOpen }: { item: Item; bionic: boolean; enter: boolean; onOpen: OpenFn }) {
  const key = itemKey(item);
  const click = useOpen(key, onOpen);
  const n = item.bronnen?.length ?? 0;
  return (
    <a className={`lead cat-${item.cat} ${enter ? "enter" : ""}`} data-id={key} href={`#/bericht/${key}`} onClick={click}>
      <div className="kicker">
        <i className="mk" />
        {CAT_LABEL[item.cat] ?? item.cat}
        {item.tijd ? <time className="tnum">{item.tijd}</time> : null}
      </div>
      <h2 className="lead-title">{item.kop}</h2>
      {item.ai ? (
        <p className="lead-sum bn">
          <BionicText text={item.ai} on={bionic} />
        </p>
      ) : null}
      <div className="row-foot">
        <span className="src">{n > 0 ? `${bronLabel(item.bronnen)} · ${bronnenTekst(n)}` : "Geen bron"}</span>
        <span className="more">
          Lees verder <Icon name="next" className="sm" />
        </span>
      </div>
    </a>
  );
});

const NewsRow = memo(function NewsRow({ item, i, bionic, enter, onOpen }: { item: Item; i: number; bionic: boolean; enter: boolean; onOpen: OpenFn }) {
  const key = itemKey(item);
  const click = useOpen(key, onOpen);
  const n = item.bronnen?.length ?? 0;
  const anim = enter && i < 12;
  return (
    <a
      className={`row cat-${item.cat} ${anim ? "enter" : ""}`}
      data-id={key}
      href={`#/bericht/${key}`}
      style={anim ? ({ "--i": i + 1 } as React.CSSProperties) : undefined}
      onClick={click}
    >
      <time className="row-time tnum">{item.tijd || ""}</time>
      <div className="row-main">
        <div className="kicker">
          <i className="mk" />
          {CAT_LABEL[item.cat] ?? item.cat}
        </div>
        <h3 className="row-title">{item.kop}</h3>
        {item.ai ? (
          <p className="row-sum bn">
            <BionicText text={item.ai} on={bionic} />
          </p>
        ) : null}
        <div className="row-foot">
          <span className="src" title={(item.bronnen ?? []).map((b) => b.site).join(", ")}>
            {n > 0 ? bronLabel(item.bronnen) : "Geen bron"}
          </span>
          <span className="more" aria-hidden="true">
            <Icon name="next" className="sm" />
          </span>
        </div>
      </div>
    </a>
  );
});

function NewsList({ items, view, bionic, focusKey, onOpen }: { items: Item[]; view: View; bionic: boolean; focusKey: string | null; onOpen: OpenFn }) {
  const [enter] = useState(() => !introDone && motionOK());
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => sortItems(items), [items]);
  const leadIdx = useMemo(() => pickLead(sorted), [sorted]);
  if (sorted.length === 0)
    return (
      <div className="empty">
        <Icon name="clock" />
        Nog geen berichten van vandaag in deze rubriek. Om 08:00 en 12:00 komt er nieuws bij.
      </div>
    );
  const lead = sorted[leadIdx];
  const rest = sorted.filter((_, i) => i !== leadIdx);
  const limit = view === "alles" && !showAll && rest.length > ALLES_FIRST + 6;
  const focusIdx = focusKey ? rest.findIndex((x) => itemKey(x) === focusKey) : -1;
  const shown = limit && focusIdx < ALLES_FIRST ? rest.slice(0, ALLES_FIRST) : rest;
  return (
    <div className={enter ? "" : "swap"}>
      <LeadStory item={lead} bionic={bionic} enter={enter} onOpen={onOpen} />
      {shown.length ? (
        <div className="rows">
          {shown.map((it, i) => (
            <NewsRow key={itemKey(it)} item={it} i={i} bionic={bionic} enter={enter} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
      {shown.length < rest.length ? (
        <div className="morewrap">
          <button type="button" className="btn" onClick={() => setShowAll(true)}>
            Toon alle {sorted.length} berichten
          </button>
        </div>
      ) : null}
    </div>
  );
}

function monoOf(site: string) {
  return site.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "•";
}
function SourceRow({ b }: { b: Bron }) {
  const [imgOk, setImgOk] = useState(true);
  const h = host(b.href);
  return (
    <li>
      <a className="srcrow" href={b.href} target="_blank" rel="noopener noreferrer">
        <span className="mono" aria-hidden="true">
          {imgOk && h ? (
            <img src={`https://icons.duckduckgo.com/ip3/${h}.ico`} alt="" width={16} height={16} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
          ) : (
            monoOf(b.site)
          )}
        </span>
        <span className="s-title">{b.site}</span>
        <span className="s-out">{h}</span>
        <Icon name="ext" className="sm" label="Opent in nieuw tabblad" />
      </a>
    </li>
  );
}

function DetailView({ item, onBack, bionic }: { item: Item; onBack: () => void; bionic: boolean }) {
  useEffect(() => {
    document.title = `${item.kop} · Nieuws in het kort`;
    return () => {
      document.title = "Nieuws in het kort";
    };
  }, [item]);
  const paragraphs = (item.samenvatting || "").split(/\n\s*\n/).filter((p) => p.trim());
  const punten = item.punten ?? [];
  const bronnen = item.bronnen ?? [];
  return (
    <article className={`detail cat-${item.cat}`}>
      <button type="button" className="back" onClick={onBack}>
        <Icon name="back" className="sm" />
        Terug naar het nieuws
      </button>
      <header className="d-head">
        <div className="kicker">
          <i className="mk" />
          {CAT_LABEL[item.cat] ?? item.cat}
          {item.tijd ? <time className="tnum">{item.tijd}</time> : null}
          {bronnen.length ? <span className="muted">{bronnenTekst(bronnen.length)}</span> : null}
        </div>
        <h1 className="d-title">{item.kop}</h1>
        {item.ai ? (
          <p className="d-lead bn">
            <BionicText text={item.ai} on={bionic} />
          </p>
        ) : null}
      </header>
      {paragraphs.length ? (
        <div className="d-body bn">
          {paragraphs.map((p, n) => (
            <p key={n}>
              <BionicText text={p} on={bionic} />
            </p>
          ))}
        </div>
      ) : null}
      {punten.length ? (
        <section className="d-sec" aria-label="Belangrijkste punten">
          <h2 className="d-h">Belangrijkste punten</h2>
          <ol className="points bn">
            {punten.map((p, i) => (
              <li key={i}>
                <BionicText text={p} on={bionic} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <section className="d-sec" aria-label="Bronnen">
        <h2 className="d-h">Bronnen</h2>
        {bronnen.length ? (
          <ul className="srclist">
            {bronnen.map((b, i) => (
              <SourceRow key={b.href + i} b={b} />
            ))}
          </ul>
        ) : (
          <p className="muted">Geen bronnen bij dit bericht.</p>
        )}
      </section>
    </article>
  );
}

// ---------------------------------------------------------------- data + thema
function useData() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/data.json?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-cache" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as Data;
      d.items ??= [];
      d.filmpjes ??= [];
      d.dumpert ??= [];
      setData((prev) => (prev && prev.gegenereerd && prev.gegenereerd === d.gegenereerd ? prev : d));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
    // ververs als je terugkomt op het tabblad, en elke 15 minuten
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(load, 15 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, [load]);
  return { data, error, reload: load };
}

type Theme = "light" | "dark";
function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}
function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "dark" ? "#141311" : "#f5f2ea"));
}
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || savedTheme() || systemTheme());
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => {
      if (!savedTheme()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  // Direct wisselen: geen kleurovergang op elk element (dat hapert), één repaint en klaar.
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* negeer */
    }
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggle };
}

// ---------------------------------------------------------------- app
function TopBar({
  theme,
  onTheme,
  bionic,
  onBionic,
  onHome,
  onSources,
  filtered,
}: {
  theme: Theme;
  onTheme: () => void;
  bionic: boolean;
  onBionic: (v: boolean) => void;
  onHome: () => void;
  onSources: () => void;
  filtered: number;
}) {
  return (
    <header className="topbar">
      <div className="bar">
        <a
          className="brand"
          href="#/"
          aria-label="Nieuws in het kort, naar de voorpagina"
          onClick={(e) => {
            e.preventDefault();
            onHome();
          }}
        >
          Nieuws <em>in het kort</em>
          <span className="stop">.</span>
        </a>
        <div className="ctrls">
          <FocusSwitch value={bionic} onChange={onBionic} />
          <button
            type="button"
            className={`srcbtn ${filtered ? "has" : ""}`}
            onClick={onSources}
            aria-haspopup="dialog"
            aria-label={filtered ? `Bronnen: ${filtered} uit` : "Bronnen"}
            title="Bronnen kiezen"
          >
            <Icon name="sliders" />
            <span className="srcbtn-l">Bronnen</span>
            {filtered ? <span className="badge tnum">{filtered}</span> : null}
          </button>
          <button type="button" className="iconbtn" aria-label={theme === "dark" ? "Schakel naar lichte modus" : "Schakel naar donkere modus"} onClick={onTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="foot-brand">
        Nieuws <em>in het kort</em>
        <span className="stop">.</span>
      </div>
      <p>Samengevat uit de bronnen die bij elk bericht staan. Elke dag om 08:00 en 12:00 bijgewerkt, met nieuws vanaf middernacht. nieuwsinkort.nl</p>
    </footer>
  );
}

function Front({ children }: { children: ReactNode }) {
  const [enter] = useState(() => !introDone && motionOK());
  return <div className={`front ${enter ? "enter" : ""}`}>{children}</div>;
}

function Frame({ children, top }: { children: ReactNode; top: ReactNode }) {
  return (
    <div className="app">
      <IconSprite />
      <div className="shell">
        {top}
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const { data: raw, error, reload } = useData();
  const { theme, toggle } = useTheme();
  const catalog = useCatalog();
  const { off, setMany, reset } = useSourceFilter();
  const { groups, index } = useMemo(() => buildSources(catalog, raw), [catalog, raw]);
  const filtered = useFiltered(raw, index, off);
  const data = filtered?.data ?? null;
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [bionic, setBionic] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(BIONIC_KEY);
      if (saved === "0") setBionic(false);
      else if (saved === "1") setBionic(true);
    } catch {
      /* standaard aan */
    }
    const onHash = () => {
      const next = parseHash();
      const prev = routeRef.current;
      const back = prev.selected && !next.selected ? prev.selected : null;
      // concurrent renderen: de browser blijft frames tekenen terwijl React de nieuwe weergave bouwt
      startTransition(() => {
        setFocusKey(back);
        setRoute(next);
      });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Scroll na het wisselen van pagina: naar boven bij detail, terug naar het bericht bij "terug".
  const prevSel = useRef(route.selected);
  useLayoutEffect(() => {
    const was = prevSel.current;
    prevSel.current = route.selected;
    if (was === route.selected) return;
    if (route.selected) window.scrollTo(0, 0);
    else if (was) {
      const n = document.querySelector(`[data-id="${CSS.escape(was)}"]`);
      if (n) n.scrollIntoView({ block: "center" });
      else window.scrollTo(0, 0);
    }
  }, [route.selected]);

  useEffect(() => {
    if (data) introDone = true;
  }, [data]);

  const setBionicPersist = (v: boolean) => {
    setBionic(v);
    try {
      localStorage.setItem(BIONIC_KEY, v ? "1" : "0");
    } catch {
      /* negeer */
    }
  };
  const setView = (v: View) => {
    // Mobiel: Filmpjes/Dumpert openen meteen de verticale feed (sluiten gaat naar het overzicht).
    if ((v === "filmpjes" || v === "dumpert") && data && window.matchMedia?.("(max-width: 640px)").matches) {
      const list = v === "filmpjes" ? data.filmpjes : data.dumpert;
      if (list.length) {
        feedPushed = false;
        window.location.hash = `#/${v}/${encodeURIComponent(videoSlug(list[0]))}`;
        return;
      }
    }
    if (viewHash(v) === (window.location.hash || "#/")) return;
    window.location.hash = viewHash(v);
  };
  const openFeed = useCallback((cat: "filmpjes" | "dumpert", slug: string) => {
    feedPushed = true;
    window.location.hash = `#/${cat}/${encodeURIComponent(slug)}`;
  }, []);
  const closeFeed = useCallback((cat: "filmpjes" | "dumpert") => {
    if (feedPushed) {
      feedPushed = false;
      window.history.back();
    } else {
      window.location.replace(`${window.location.pathname}${window.location.search}#/${cat}`);
    }
  }, []);
  const open = useCallback((key: string) => {
    openedInside = true;
    window.location.hash = `#/bericht/${key}`;
  }, []);
  const goHome = () => {
    if (window.location.hash && window.location.hash !== "#/" && window.location.hash !== "#") window.location.hash = "#/";
    else window.scrollTo({ top: 0, behavior: motionOK() ? "smooth" : "auto" });
  };

  const top = (
    <>
      <TopBar theme={theme} onTheme={toggle} bionic={bionic} onBionic={setBionicPersist} onHome={goHome} onSources={() => setSheet(true)} filtered={off.size} />
      <div className="dateline">
        <span className="date">{raw ? cap(raw.datum) : "\u00a0"}</span>
        {raw ? (
          <span className="upd">
            <i className={`live ${error ? "off" : ""}`} />
            {amsterdamTime(raw.gegenereerd) ? (
              <>
                Bijgewerkt <span className="tnum">{amsterdamTime(raw.gegenereerd)}</span>
              </>
            ) : (
              "Bijgewerkt vandaag"
            )}
          </span>
        ) : null}
      </div>
      {sheet ? (
        <SourcesSheet groups={groups} weer={raw?.weer?.bronnen ?? []} off={off} setMany={setMany} reset={reset} onClose={() => setSheet(false)} />
      ) : null}
    </>
  );

  if (!data || !raw) {
    return (
      <Frame top={top}>
        <main className="wrap" id="top">
          {error ? (
            <div className="empty" style={{ marginTop: 24 }}>
              <Icon name="alert" />
              Het nieuws laden lukt even niet.
              <button type="button" className="linkbtn" onClick={reload}>
                Probeer opnieuw
              </button>
            </div>
          ) : (
            <div aria-busy="true" aria-label="Nieuws laden" className="skeleton">
              <div className="front">
                <div>
                  <div className="skel" style={{ width: 90, height: 12 }} />
                  <div className="skel" style={{ height: 22, marginTop: 14 }} />
                  <div className="skel" style={{ height: 22, marginTop: 10 }} />
                  <div className="skel" style={{ height: 22, marginTop: 10, width: "70%" }} />
                </div>
                <div className="skel" style={{ height: 240 }} />
              </div>
              <div className="skel" style={{ height: 40, marginTop: 40 }} />
              {[0, 1, 2].map((i) => (
                <div key={i} className="skel" style={{ height: 96, marginTop: 20 }} />
              ))}
            </div>
          )}
          <Footer />
        </main>
      </Frame>
    );
  }

  // Detail: eerst in de gefilterde lijst (met alleen de actieve bronnen), anders het origineel (directe link).
  const selectedItem = route.selected
    ? data.items.find((i) => itemKey(i) === route.selected) ?? raw.items.find((i) => itemKey(i) === route.selected) ?? null
    : null;

  if (selectedItem) {
    return (
      <Frame top={top}>
        <main className="wrap page-in" id="top" key={`d-${route.selected}`}>
          <DetailView
            item={selectedItem}
            bionic={bionic}
            onBack={() => {
              if (openedInside) window.history.back();
              else window.location.hash = "#/";
            }}
          />
          <Footer />
        </main>
      </Frame>
    );
  }

  const view = route.view;
  const isVideo = view === "filmpjes" || view === "dumpert";
  const kortSources = raw.items.reduce((n, a) => n + (a.bronnen?.length ?? 0), 0);
  const hidden = filtered?.hidden ?? 0;
  return (
    <Frame top={top}>
      <main className="wrap" id="top">
        <Front>
          <Briefing text={raw.dag_samenvatting} bionic={bionic} sources={kortSources} time={amsterdamTime(raw.gegenereerd)} />
          <WeatherBox W={raw.weer} bionic={bionic} />
        </Front>
        <Tabs data={data} view={view} onChange={setView} />
        {off.size ? (
          <div className="filternote" role="status">
            <span>
              {hidden ? `${hidden} ${hidden === 1 ? "bericht" : "berichten"} verborgen` : "Bronnenfilter staat aan"} · {off.size} {off.size === 1 ? "bron" : "bronnen"} uit
            </span>
            <button type="button" className="textbtn" onClick={() => setSheet(true)}>
              Aanpassen
            </button>
            <button type="button" className="textbtn" onClick={reset}>
              Alles tonen
            </button>
          </div>
        ) : null}
        {isVideo ? (
          <VideoGrid
            key={view}
            cat={view}
            list={view === "filmpjes" ? data.filmpjes : data.dumpert}
            bionic={bionic}
            bronFilter={view === "filmpjes"}
            enter={!introDone && motionOK()}
            video={route.video}
            onOpen={(slug) => openFeed(view, slug)}
            onCloseFeed={() => closeFeed(view)}
          />
        ) : (
          <NewsList
            key={view}
            view={view}
            items={view === "alles" ? data.items : data.items.filter((i) => i.cat === view)}
            bionic={bionic}
            focusKey={focusKey}
            onOpen={open}
          />
        )}
        <Footer />
      </main>
    </Frame>
  );
}
