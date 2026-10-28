import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Bron, Cat, Data, Item, View, Weer, WeerDag } from "./types";
import { BionicText, FocusSwitch, host } from "./ui";
import { Icon, IconSprite, type IconName } from "./icons";
import { VideoGrid } from "./video";

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
type VTDoc = Document & { startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> } };
const canVT = () => motionOK() && typeof (document as VTDoc).startViewTransition === "function";
function withVT(update: () => void, after?: () => void) {
  if (!canVT()) {
    update();
    after?.();
    return;
  }
  try {
    const t = (document as VTDoc).startViewTransition!(() => update());
    t.finished.then(after, after);
  } catch {
    update();
    after?.();
  }
}

function amsterdamTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(d);
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---- routing via hash: #/nederland, #/filmpjes, #/bericht/<slug>
type Route = { view: View; selected: string | null };
function parseHash(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
  if (h.startsWith("bericht/")) return { view: "alles", selected: h.slice(8) };
  const c = CATS.find((c) => c.slug === h);
  if (c) return { view: c.id, selected: null };
  if (h === "filmpjes" || h === "dumpert") return { view: h, selected: null };
  return { view: "alles", selected: null };
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
      <Icon name="alert" />
      <div>{m ? <><strong>{m[1]}</strong> {m[2]}</> : <strong>{text}</strong>}</div>
    </div>
  );
}

function WeatherCard({ W, bionic, anim }: { W?: Weer; bionic: boolean; anim: boolean }) {
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
    <section className={`card weather ${anim ? "fade" : ""}`} aria-label={`Weer in ${plaats}`}>
      {W?.waarschuwing ? <WarnBanner text={W.waarschuwing} /> : null}
      <div className="w-head">
        <div className="w-place">
          <Icon name="pin" className="sm" />
          {plaats} <span>nu</span>
        </div>
        {W?.bijgewerkt ? <span className="w-upd">Weer bijgewerkt {W.bijgewerkt}</span> : null}
      </div>
      {leeg ? (
        <div className="empty" style={{ padding: "8px 0" }}>
          <Icon name="cloud" />
          Het weerbericht is er nu even niet. Kom straks nog eens kijken.
        </div>
      ) : (
        <>
          {heeftNu || W?.verwachting ? (
            <div className="w-main">
              {heeftNu ? (
                <div className="w-now">
                  <Icon name={kind as IconName} className={`w-icon ${KIND_CLASS[kind]}`} />
                  <div>
                    <div className="w-temp">{nu.temp}°</div>
                    <div className="w-cond">
                      {nu.omschrijving || ""}
                      {typeof nu.gevoel === "number" ? `${nu.omschrijving ? " · " : ""}voelt als ${nu.gevoel}°` : ""}
                    </div>
                  </div>
                </div>
              ) : null}
              {W?.verwachting ? (
                <p className="w-text bn">
                  <BionicText text={W.verwachting} on={bionic} />
                </p>
              ) : null}
            </div>
          ) : null}
          {stats.length ? (
            <div className="w-stats">
              {stats.map((s) => (
                <span key={s.k}>
                  {s.k} <b>{s.v}</b>
                </span>
              ))}
            </div>
          ) : null}
          {dagen.length ? (
            <div className="w-days" style={{ gridTemplateColumns: `repeat(${Math.min(dagen.length, 4)},minmax(0,1fr))` }}>
              {dagen.slice(0, 4).map((d, i) => {
                const k = weatherKind(d.omschrijving);
                const label = d.omschrijving || { sun: "Zonnig", rain: "Regen", partly: "Half bewolkt", cloud: "Bewolkt" }[k];
                return (
                  <div className="day" key={d.dag + i} title={label} style={anim ? undefined : { animation: "none" }}>
                    <span className="dn">{cap(d.dag)}</span>
                    <span className="dd">{dates[i] || label}</span>
                    <Icon name={k} className={KIND_CLASS[k]} label={label} />
                    <span className="hi">{typeof d.max === "number" ? `${d.max}°` : "–"}</span>
                    <span className="lo">{typeof d.min === "number" ? `${d.min}°` : "–"}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
      {W?.bronnen?.length ? (
        <div className="w-src">
          <span>Bron:</span>
          {W.bronnen.map((b) => (
            <a key={b.href} href={b.href} target="_blank" rel="noreferrer">
              {b.site}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({ text, bionic, sources, time, anim }: { text: string; bionic: boolean; sources: number; time: string; anim: boolean }) {
  return (
    <section className={`card kort ${anim ? "fade" : ""}`} style={{ animationDelay: "80ms" }} aria-label="In het kort">
      <div className="eyebrow">
        <Icon name="spark" className="sm" />
        In het kort
      </div>
      {text ? (
        <p className="k-text bn">
          <BionicText text={text} on={bionic} />
        </p>
      ) : (
        <p className="k-text" style={{ color: "var(--muted-fg)" }}>
          De samenvatting van vandaag komt er zo aan.
        </p>
      )}
      {sources > 0 ? (
        <div className="k-meta">
          Samengevat uit {bronnenTekst(sources)}
          {time ? ` · ${time}` : ""}
        </div>
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
  const measure = useCallback(() => {
    const list = listRef.current;
    const ind = indRef.current;
    if (!list || !ind) return;
    const sel = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!sel) return;
    const fresh = first.current;
    if (fresh) ind.style.transition = "none";
    list.style.setProperty("--ix", sel.offsetLeft + "px");
    list.style.setProperty("--iw", sel.offsetWidth + "px");
    if (fresh) {
      void ind.offsetWidth;
      ind.style.transition = "";
      first.current = false;
    }
    ind.classList.add("ready");
    if (list.scrollWidth > list.clientWidth) {
      const left = Math.max(0, sel.offsetLeft - (list.clientWidth - sel.offsetWidth) / 2);
      list.scrollTo({ left, behavior: fresh || !motionOK() ? "auto" : "smooth" });
    }
  }, []);
  useLayoutEffect(() => {
    measure();
  });
  useEffect(() => {
    const list = listRef.current;
    if (!list || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(list);
    list.querySelectorAll(".tab").forEach((n) => ro.observe(n));
    document.fonts?.ready.then(() => measure()).catch(() => {});
    return () => ro.disconnect();
  }, [measure]);
  return (
    <nav className="tabs" aria-label="Rubrieken">
      <div className="tablist" role="tablist" ref={listRef}>
        <span className="ind" ref={indRef} aria-hidden="true" />
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`tab cat-${o.id}`}
            role="tab"
            aria-selected={view === o.value}
            onClick={() => onChange(o.value)}
          >
            <i className="tdot" />
            <span>{o.label}</span>
            <span className="tcount">{o.count}</span>
          </button>
        ))}
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

function NewsCard({ item, i, bionic, anim, hero, onOpen }: { item: Item; i: number; bionic: boolean; anim: boolean; hero: boolean; onOpen: (k: string, el: HTMLElement) => void }) {
  const key = itemKey(item);
  const n = item.bronnen?.length ?? 0;
  return (
    <a
      className={`card ncard cat-${item.cat} ${anim ? "fade" : ""}`}
      data-id={key}
      href={`#/bericht/${key}`}
      style={{ animationDelay: `${Math.min(i, 9) * 45}ms`, viewTransitionName: hero ? "hero" : undefined } as React.CSSProperties}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(key, e.currentTarget);
      }}
    >
      <div className="n-top">
        <span className="label">
          <i />
          {CAT_LABEL[item.cat] ?? item.cat}
        </span>
        {item.tijd ? <time>{item.tijd}</time> : null}
      </div>
      <h3 className="n-title">{item.kop}</h3>
      {item.ai ? (
        <p className="n-sum bn">
          <BionicText text={item.ai} on={bionic} />
        </p>
      ) : null}
      <div className="n-foot">
        <span className="src" title={(item.bronnen ?? []).map((b) => b.site).join(", ")}>
          <Icon name="layers" className="sm" />
          {n > 0 ? bronLabel(item.bronnen) : "Geen bron"}
        </span>
        <span className="more">
          Lees meer <Icon name="next" className="sm" />
        </span>
      </div>
    </a>
  );
}

function NewsGrid({ items, view, bionic, anim, heroKey, onOpen }: { items: Item[]; view: View; bionic: boolean; anim: boolean; heroKey: string | null; onOpen: (k: string, el: HTMLElement) => void }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = sortItems(items);
  const limit = view === "alles" && !showAll && sorted.length > ALLES_FIRST + 6;
  // kaart waar je vandaan kwam altijd laten zien
  const heroIdx = heroKey ? sorted.findIndex((x) => itemKey(x) === heroKey) : -1;
  const shown = limit && heroIdx < ALLES_FIRST ? sorted.slice(0, ALLES_FIRST) : sorted;
  if (sorted.length === 0)
    return (
      <div className="card empty fade">
        <Icon name="clock" />
        Nog geen berichten van vandaag in deze rubriek. Om 08:00 en 12:00 komt er nieuws bij.
      </div>
    );
  return (
    <>
      <div className="grid">
        {shown.map((it, i) => (
          <NewsCard key={itemKey(it)} item={it} i={i} bionic={bionic} anim={anim} hero={heroKey === itemKey(it)} onOpen={onOpen} />
        ))}
      </div>
      {shown.length < sorted.length ? (
        <div className="morewrap">
          <button type="button" className="back" onClick={() => setShowAll(true)}>
            Toon alle {sorted.length} berichten <Icon name="next" className="sm" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function monoOf(site: string) {
  return site.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "•";
}
function SourceRow({ b }: { b: Bron }) {
  const [imgOk, setImgOk] = useState(true);
  const h = host(b.href);
  return (
    <a className="srcrow" href={b.href} target="_blank" rel="noopener noreferrer">
      <span className="mono" aria-hidden="true">
        {imgOk && h ? (
          <img src={`https://icons.duckduckgo.com/ip3/${h}.ico`} alt="" width={20} height={20} loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
        ) : (
          monoOf(b.site)
        )}
      </span>
      <span className="s-text">
        <span className="s-out">{h}</span>
        <span className="s-title">{b.site}</span>
      </span>
      <Icon name="ext" className="sm" label="Opent in nieuw tabblad" />
    </a>
  );
}

function DetailView({ item, onBack, bionic, anim }: { item: Item; onBack: () => void; bionic: boolean; anim: boolean }) {
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
    <article className={`detail cat-${item.cat} ${anim ? "fade" : ""}`}>
      <button type="button" className="back" onClick={onBack}>
        <Icon name="back" className="sm" />
        Terug naar nieuws
      </button>
      <header className="d-head">
        <div className="d-meta">
          <span className="label">
            <i />
            {CAT_LABEL[item.cat] ?? item.cat}
          </span>
          {item.tijd ? (
            <span>
              <Icon name="clock" className="sm" />
              {item.tijd}
            </span>
          ) : null}
          {bronnen.length ? (
            <span>
              <Icon name="layers" className="sm" />
              {bronnenTekst(bronnen.length)}
            </span>
          ) : null}
        </div>
        <h1 className="d-title">{item.kop}</h1>
        {item.ai ? (
          <p className="d-lead bn">
            <BionicText text={item.ai} on={bionic} />
          </p>
        ) : null}
      </header>
      {paragraphs.length ? (
        <div className="d-sum bn">
          {paragraphs.map((p, n) => (
            <p key={n}>
              <BionicText text={p} on={bionic} />
            </p>
          ))}
        </div>
      ) : null}
      {punten.length ? (
        <section className="card d-block" aria-label="Belangrijkste punten">
          <h2 className="d-h">Belangrijkste punten</h2>
          <ul className="points bn">
            {punten.map((p, i) => (
              <li key={i}>
                <i />
                <span>
                  <BionicText text={p} on={bionic} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="d-srcs" aria-label="Bronnen">
        <h2 className="d-h">Bronnen</h2>
        {bronnen.length ? (
          <div className="card srclist">
            {bronnen.map((b, i) => (
              <SourceRow key={b.href + i} b={b} />
            ))}
          </div>
        ) : (
          <div className="card empty">Geen bronnen bij dit bericht.</div>
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
      setData(d);
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
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "dark" ? "#09090b" : "#fafafa"));
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
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* negeer */
    }
    if (canVT()) {
      withVT(() => {
        flushSync(() => setTheme(next));
        applyTheme(next);
      });
    } else {
      const root = document.documentElement;
      if (motionOK()) {
        root.classList.add("theme-fade");
        window.setTimeout(() => root.classList.remove("theme-fade"), 350);
      }
      setTheme(next);
    }
  };
  return { theme, toggle };
}

// ---------------------------------------------------------------- app
function TopBar({ theme, onTheme, bionic, onBionic, onHome }: { theme: Theme; onTheme: () => void; bionic: boolean; onBionic: (v: boolean) => void; onHome: () => void }) {
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
          <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="currentColor" />
            <rect className="l" x="8" y="10" width="16" height="3" rx="1.5" />
            <rect className="l" x="8" y="15" width="12" height="3" rx="1.5" />
            <rect className="l" x="8" y="20" width="7" height="3" rx="1.5" />
          </svg>
          <span>
            Nieuws <span className="sub">in het kort</span>
          </span>
        </a>
        <div className="ctrls">
          <FocusSwitch value={bionic} onChange={onBionic} />
          <button type="button" className="iconbtn" aria-label={theme === "dark" ? "Schakel naar lichte modus" : "Schakel naar donkere modus"} onClick={onTheme}>
            <Icon key={theme} name={theme === "dark" ? "sun" : "moon"} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div>
        <strong>Nieuws in het kort</strong>
        <br />
        nieuwsinkort.nl
      </div>
      <p>Samengevat uit de bronnen die bij elk bericht staan. Elke dag om 08:00 en 12:00 bijgewerkt, met nieuws vanaf middernacht.</p>
    </footer>
  );
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
  const { data, error, reload } = useData();
  const { theme, toggle } = useTheme();
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [bionic, setBionic] = useState(true);
  const [still, setStill] = useState(false); // geen fade-in tijdens een view transition
  const [heroKey, setHeroKey] = useState<string | null>(null);
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
      const detailChange = next.selected !== prev.selected;
      if (!detailChange) {
        setStill(false);
        setRoute(next);
        return;
      }
      const back = !!prev.selected && !next.selected ? prev.selected : null;
      const vt = canVT();
      withVT(
        () => {
          flushSync(() => {
            setStill(vt);
            setHeroKey(back);
            setRoute(next);
          });
          if (back) {
            const n = document.querySelector(`[data-id="${CSS.escape(back)}"]`);
            if (n) n.scrollIntoView({ block: "center" });
            else window.scrollTo(0, 0);
          } else window.scrollTo(0, 0);
        },
        () => {
          setHeroKey(null);
          document.querySelectorAll<HTMLElement>(".ncard").forEach((el) => (el.style.viewTransitionName = ""));
        }
      );
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setBionicPersist = (v: boolean) => {
    setBionic(v);
    try {
      localStorage.setItem(BIONIC_KEY, v ? "1" : "0");
    } catch {
      /* negeer */
    }
  };
  const setView = (v: View) => {
    if (viewHash(v) === (window.location.hash || "#/")) return;
    window.location.hash = viewHash(v);
  };
  const open = (key: string, el: HTMLElement) => {
    openedInside = true;
    if (canVT()) el.style.viewTransitionName = "hero";
    window.location.hash = `#/bericht/${key}`;
  };
  const goHome = () => {
    if (window.location.hash && window.location.hash !== "#/" && window.location.hash !== "#") window.location.hash = "#/";
    else window.scrollTo({ top: 0, behavior: motionOK() ? "smooth" : "auto" });
  };

  const top = (
    <>
      <TopBar theme={theme} onTheme={toggle} bionic={bionic} onBionic={setBionicPersist} onHome={goHome} />
      <div className="datebar">
        <span className="date">{data ? cap(data.datum) : "\u00a0"}</span>
        {data ? (
          <span className="upd">
            <i className={`live ${error ? "off" : ""}`} />
            {amsterdamTime(data.gegenereerd) ? `Bijgewerkt om ${amsterdamTime(data.gegenereerd)}` : "Bijgewerkt vandaag"}
          </span>
        ) : null}
      </div>
    </>
  );

  if (!data) {
    return (
      <Frame top={top}>
        <main className="wrap" id="top">
          {error ? (
            <div className="card empty" style={{ marginTop: 16 }}>
              <Icon name="alert" />
              Het nieuws laden lukt even niet.
              <button type="button" className="linkbtn" onClick={reload}>
                Probeer opnieuw
              </button>
            </div>
          ) : (
            <div aria-busy="true" aria-label="Nieuws laden">
              <div className="hero">
                <div className="skel" style={{ flex: "1.5 1 420px", height: 300 }} />
                <div className="skel" style={{ flex: "1 1 300px", height: 300 }} />
              </div>
              <div className="grid" style={{ marginTop: 92 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skel" style={{ height: 220 }} />
                ))}
              </div>
            </div>
          )}
          <Footer />
        </main>
      </Frame>
    );
  }

  const selectedItem = route.selected ? data.items.find((i) => itemKey(i) === route.selected) ?? null : null;
  const anim = !still;

  if (selectedItem) {
    return (
      <Frame top={top}>
        <main className="wrap" id="top">
          <DetailView
            item={selectedItem}
            bionic={bionic}
            anim={anim}
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
  const kortSources = data.items.reduce((n, a) => n + (a.bronnen?.length ?? 0), 0);
  return (
    <Frame top={top}>
      <main className="wrap" id="top">
        <div className="hero">
          <WeatherCard W={data.weer} bionic={bionic} anim={anim} />
          <SummaryCard text={data.dag_samenvatting} bionic={bionic} sources={kortSources} time={amsterdamTime(data.gegenereerd)} anim={anim} />
        </div>
        <Tabs data={data} view={view} onChange={setView} />
        {isVideo ? (
          <VideoGrid key={view} cat={view} list={view === "filmpjes" ? data.filmpjes : data.dumpert} bionic={bionic} bronFilter={view === "filmpjes"} />
        ) : (
          <NewsGrid
            key={view}
            view={view}
            items={view === "alles" ? data.items : data.items.filter((i) => i.cat === view)}
            bionic={bionic}
            anim={anim}
            heroKey={heroKey}
            onOpen={open}
          />
        )}
        <Footer />
      </main>
    </Frame>
  );
}
