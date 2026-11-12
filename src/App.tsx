import { Foutgrens } from "./foutgrens";
import { flushSync } from "react-dom";
import { DUUR, animeer, kanOvergang, metOvergang, rustig, scrollGedrag } from "./beweging";
import { artikelId } from "./artikelid";
import { ams, dayDates } from "./tijd";
import { Suspense, lazy, memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Data, Item, View, Weer } from "./types";
import { BionicText, FocusSwitch } from "./ui";
import { bewaarFocusKeuze, browserStorage, leesFocusKeuze, ruimOudeFocusKeuzeOp } from "./focuslezen";
import { actieveBronnen, buildSources, useCatalog, useFiltered, useSourceFilter } from "./sources";
import { Icon, IconSprite, type IconName } from "./icons";
import { playerFor, soortVan, startSoort } from "./videosoort";
import { sorteerOpGroep } from "./filmgroep";
import { useVoorladen } from "./usevoorladen";
import { videoSlug } from "./slug";
import { zaaiSamenvattingen } from "./samenvattingcache";
import { schoon } from "./schoon";
import { valideer } from "./valideer";
import { debug } from "./debug";
import { Beelden, Thumb } from "./beelden";
import { FilterBalk, filterNieuws, filterVideos, useFilters, useVideoKlok } from "./filters";
import { veiligeUrl } from "./url";
import { herindeel } from "./regio";
import { bronnenTekst, fotos } from "./leesverder";
import { touchNu } from "./invoer";
import { laadData, neemVroegeData } from "./vroeg";
import { CAT_LABEL, tabOpties, tabToets, wisselRichting, type TabOpt } from "./tabs";
import { TabBriefing, kopKompact } from "./tabbriefing";
import { parseHash, viewHash, viewTitel, type Route } from "./route";
import { LeegMelding } from "./leegmelding";
import { kiesNieuweData, verwijderGisteren } from "./vandaag";
import { zoekItems } from "./zoek";
import { Zoekbalk, ZoekLeeg } from "./zoekbalk";
import { useKlok } from "./useklok";
import { maakFeedNavigatie } from "./feedsluiten";
import { NewsFeed } from "./nieuws-feed";
import { ArtikelDetail, laadDetail } from "./artikel-detail";
import { bronLabel, itemKey, pickLead, sortItems } from "./nieuws-hulp";
import { useOpen, type OpenFn } from "./nieuws-open";
import { Footer, UUR_ACTIEF } from "./app-frame";

// Niet-kritiek: pas laden als het blad opengaat (docs/architectuur.md#chunk-indeling)
const SourcesSheet = lazy(() => import("./sheet").then((m) => ({ default: m.SourcesSheet })));
const VideoGrid = lazy(() => import("./video").then((m) => ({ default: m.VideoGrid })));
const FilterBlad = lazy(() => import("./filters-blad").then((m) => ({ default: m.FilterBlad })));


const ALLES_FIRST = 24; // op "Home" eerst zoveel kaarten, daarna "Toon alle"
const THEME_KEY = "nieuwsinkort-thema";
let openedInside = false;
// feed geopend vanuit het overzicht (dan is sluiten = history.back())
const feedNav = maakFeedNavigatie({ get location() { return window.location; }, get history() { return window.history; } });
// Intro-animatie alleen bij de eerste keer laden; daarna (tabwissel, herladen) niet opnieuw.
let introDone = false;

// ---------------------------------------------------------------- helpers
function amsterdamTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(d);
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// De oude Alles-route vervangen zonder een extra geschiedenisitem.
function huidigeRoute(): Route {
  if (window.location.hash === "#/alles") {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#/`);
  }
  return parseHash(window.location.hash);
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
  const dagen = (Array.isArray(W?.dagen) ? W.dagen : []).filter((d) => d && (typeof d.min === "number" || typeof d.max === "number"));
  const heeftNu = typeof nu.temp === "number";
  const stats: { k: string; v: string }[] = [];
  if (typeof nu.van === "number" && typeof nu.tot === "number" && nu.van !== nu.tot) stats.push({ k: "Nu in het land", v: `${nu.van}° tot ${nu.tot}°` });
  if (typeof vd.min === "number" || typeof vd.max === "number")
    stats.push({ k: "Vandaag", v: `${typeof vd.min === "number" ? `${vd.min}°` : "–"} / ${typeof vd.max === "number" ? `${vd.max}°` : "–"}` });
  if (typeof vd.neerslagkans === "number") stats.push({ k: "Neerslag", v: `${vd.neerslagkans}%` });
  if (vd.wind) stats.push({ k: "Wind", v: vd.wind });
  const leeg = !W || (!heeftNu && stats.length === 0 && !W.verwachting && dagen.length === 0 && !W.waarschuwing);
  const plaats = W?.plaats || "Nederland";
  const kind = weatherKind(nu.omschrijving);
  const dates = dayDates(dagen.slice(0, 4));
  return (
    <section className="wx" aria-label={`Weer in ${plaats === "Nederland" ? "heel Nederland" : plaats}`}>
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
              <a href={veiligeUrl(b.href)} target="_blank" rel="noreferrer">
                {b.site}
              </a>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Briefing({ text, bionic, sources, time, note }: { text: string; bionic: boolean; sources: number; time: string; note?: string }) {
  return (
    <section className="brief" aria-label="In het kort">
      <h2 className="kicker">In het kort</h2>
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
      {note ? <p className="brief-note">{note}</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------- tabs
// Gesegmenteerde rubriekkeuze. Past alles niet op één regel, dan gaan de laatste rubrieken in "Meer"
// (er scrollt dus niets zijwaarts in de header). De actieve rubriek staat altijd zichtbaar.
function Tabs({ data, view, onChange }: { data: Data; view: View; onChange: (v: View) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const prev = useRef<{ x: number; w: number } | null>(null);
  const [fit, setFit] = useState<{ short: boolean; count: number }>({ short: false, count: 99 });
  const [open, setOpen] = useState(false);
  const options: TabOpt[] = useMemo(() => tabOpties(data.items, view), [data.items, view]);
  const activeIdx = Math.max(0, options.findIndex((o) => o.value === view));

  // Welke tabs passen? Meten in een onzichtbare kopie (vaste breedtes, geen layout-sprongen in beeld).
  const compute = useCallback(() => {
    const wrap = wrapRef.current;
    const m = measureRef.current;
    if (!wrap || !m) return;
    const avail = wrap.clientWidth;
    const pick = (short: boolean) => {
      const row = m.querySelector<HTMLElement>(short ? ".m-short" : ".m-long");
      if (!row) return null;
      const kids = [...row.children] as HTMLElement[];
      const pad = 6; // binnenrand van de track
      const ws = kids.slice(0, options.length).map((k) => k.offsetWidth);
      const meer = kids[options.length]?.offsetWidth ?? 70;
      const total = ws.reduce((a, b) => a + b, 0) + pad;
      if (total <= avail) return options.length;
      let k = options.length - 1;
      const need = (n: number) => {
        let sum = ws.slice(0, n).reduce((a, b) => a + b, 0);
        if (activeIdx >= n) sum += ws[activeIdx];
        return sum + meer + pad;
      };
      while (k > 1 && need(k) > avail) k--;
      return k;
    };
    const long = avail >= 560 ? pick(false) : null;
    if (long !== null && long === options.length) setFit((f) => (f.short || f.count !== long ? { short: false, count: long } : f));
    else {
      const k = pick(true) ?? options.length;
      setFit((f) => (!f.short || f.count !== k ? { short: true, count: k } : f));
    }
  }, [options, activeIdx]);
  useLayoutEffect(() => compute(), [compute]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(wrap);
    document.fonts?.ready.then(() => compute()).catch(() => {});
    return () => ro.disconnect();
  }, [compute]);

  const shown = options.filter((_, i) => i < fit.count || i === activeIdx);
  const rest = options.filter((o) => !shown.includes(o));

  // Pil-indicator: breedte staat stil op de eindmaat; de beweging is een FLIP met alleen transform.
  const place = useCallback((sel: HTMLElement | null, animate: boolean) => {
    const ind = indRef.current;
    if (!ind || !sel) return;
    const x = sel.offsetLeft;
    const w = sel.offsetWidth;
    const from = prev.current;
    prev.current = { x, w };
    if (from && from.x === x && from.w === w && ind.classList.contains("ready")) return;
    ind.style.width = `${w}px`;
    if (animate && from && !rustig()) {
      ind.style.transition = "none";
      ind.style.transform = `translate3d(${from.x}px,0,0) scaleX(${from.w / w})`;
      void ind.offsetWidth;
      ind.style.transition = "";
    }
    ind.style.transform = `translate3d(${x}px,0,0)`;
    ind.classList.add("ready");
  }, []);
  const firstPlace = useRef(true);
  useLayoutEffect(() => {
    place(listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null, !firstPlace.current);
    firstPlace.current = false;
  }, [view, fit, place]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const label = (o: TabOpt) => (fit.short ? o.short : o.label);
  return (
    <nav className="tabs" aria-label="Rubrieken">
      <div className="tabs-in" ref={wrapRef}>
        <div className="seg" ref={listRef}>
          <span className="seg-ind" ref={indRef} aria-hidden="true" />
          <div className="seg-tabs" role="tablist" aria-label="Rubrieken">
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`tab cat-${o.id}`}
              role="tab"
              data-video-tab={o.value === "filmpjes" || o.value === "dumpert" ? "" : undefined}
              aria-controls="rubriek-paneel"
              aria-selected={view === o.value}
              tabIndex={view === o.value ? 0 : -1}
              onKeyDown={tabToets}
              onClick={(e) => {
                place(e.currentTarget, true); // meteen bewegen, de inhoud volgt
                onChange(o.value);
              }}
            >
              {label(o)}
            </button>
          ))}
          </div>
          {rest.length ? (
            <div className="more-wrap" ref={moreRef}>
              <button type="button" className={`tab more-btn ${open ? "open" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                Meer <Icon name="chevdown" className="sm" />
              </button>
              {open ? (
                <div className="menu" role="menu">
                  {rest.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      data-video-tab={o.value === "filmpjes" || o.value === "dumpert" ? "" : undefined}
                      onClick={() => {
                        setOpen(false);
                        onChange(o.value);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="seg-measure" ref={measureRef} aria-hidden="true">
          {[false, true].map((short) => (
            <div key={String(short)} className={`seg ${short ? "m-short" : "m-long"}`}>
              {options.map((o) => (
                <span key={o.value} className="tab-m">
                  {short ? o.short : o.label}
                </span>
              ))}
              <span className="tab-m">
                Meer <Icon name="chevdown" className="sm" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- nieuws
const LeadStory = memo(function LeadStory({ item, bionic, enter, onOpen }: { item: Item; bionic: boolean; enter: boolean; onOpen: OpenFn }) {
  const key = itemKey(item);
  const click = useOpen(key, onOpen);
  const n = item.bronnen?.length ?? 0;
  return (
    <a onPointerDown={laadDetail} onMouseEnter={laadDetail} className={`lead cat-${item.cat} ${enter ? "enter" : ""}`} data-id={key} href={`#/bericht/${key}`} onClick={click}>
      {fotos(item).length ? <Beelden urls={fotos(item)} eager className="lead-img" /> : null}
      <div className="meta">
        {CAT_LABEL[item.cat] ?? item.cat}
        {item.tijd ? <time className="tnum">{item.tijd}</time> : null}
        {item.ruw ? <span>nog niet samengevat</span> : null}
      </div>
      <h2 className="lead-title">{item.kop}</h2>
      {item.ai ? (
        <p className="lead-sum bn">
          <BionicText text={item.ai} on={bionic} />
        </p>
      ) : null}
      <div className="row-foot">
        <span className="src">{n > 0 ? `${bronLabel(item.bronnen)} · ${bronnenTekst(n)}` : "Geen bron"}</span>
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
      className={`row cat-${item.cat} ${anim ? "enter" : ""} ${fotos(item).length ? "has-img" : ""}`}
      data-id={key}
      href={`#/bericht/${key}`}
      style={anim ? ({ "--i": i + 1 } as React.CSSProperties) : undefined}
      onClick={click}
      onPointerDown={laadDetail} onMouseEnter={laadDetail}
    >
      {fotos(item).length ? <Thumb urls={fotos(item)} /> : null}
      <div className="row-main">
        <div className="meta">
          {CAT_LABEL[item.cat] ?? item.cat}
          {item.tijd ? <time className="tnum">{item.tijd}</time> : null}
          {item.ruw ? <span>nog niet samengevat</span> : null}
        </div>
        <h2 className="row-title">{item.kop}</h2>
        {item.ai ? (
          <p className="row-sum bn">
            <BionicText text={item.ai} on={bionic} />
          </p>
        ) : null}
        <div className="row-foot">
          <span className="src" title={(item.bronnen ?? []).map((b) => b.site).join(", ")}>
            {n > 0 ? bronLabel(item.bronnen) : "Geen bron"}
          </span>
        </div>
      </div>
    </a>
  );
});

function NewsList({ items, view, bionic, focusKey, onOpen, keepOrder, empty }: { items: Item[]; view: View; bionic: boolean; focusKey: string | null; onOpen: OpenFn; keepOrder?: boolean; empty?: ReactNode }) {
  const [enter] = useState(() => !introDone && !rustig());
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => (keepOrder ? items : sortItems(items)), [items, keepOrder]);
  const leadIdx = useMemo(() => (keepOrder ? 0 : pickLead(sorted)), [sorted, keepOrder]);
  if (sorted.length === 0)
    return (
      empty ?? <div className="empty">
        <Icon name="clock" />
        Nog geen berichten van vandaag in deze rubriek. Het eerste nieuws van vandaag komt rond 05:00–06:00.
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

let afgewezenBerichten = 0;
// ---------------------------------------------------------------- data + thema
export function useData() {
  const volgnummer = useRef(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const aanvraag = ++volgnummer.current;
    try {
      const antwoord = await laadData(neemVroegeData());
      if (aanvraag !== volgnummer.current) return;
      const gevalideerd = valideer(antwoord);
      afgewezenBerichten = gevalideerd.afgewezen;
      const d = schoon(gevalideerd.data as Data); // ook hier ontdubbelen: statische data zonder Pages Function
      d.items ??= [];
      d.items = d.items.map(herindeel); // ook statische/oude data: buitenland uit "nl" halen
      d.filmpjes ??= [];
      zaaiSamenvattingen(d.samenvattingen);
      d.dumpert ??= [];
      d.dumpert = d.dumpert.filter((v) => !!playerFor(v)); // alleen echte, afspeelbare filmpjes
      d.filmpjes = sorteerOpGroep(d.filmpjes.map((v) => ({ ...v, soort: soortVan(v) }))); // Shorts of Journaals; op onderwerpgroep (#459): Sport onderaan, ook voor de volgorde van doorlopend kijken
      setData((prev) => kiesNieuweData(prev, verwijderGisteren(d, Date.now())));
      setError(false);
    } catch {
      if (aanvraag === volgnummer.current) setError(true);
    }
  }, []);
  useEffect(() => {
    load();
    // ververs als je terugkomt op het tabblad, en elk kwartier
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(load, 15 * 60 * 1000);
    const grens = window.setInterval(() => setData((d) => d && verwijderGisteren(d, Date.now())), 1000);
    return () => {
      volgnummer.current++;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
      window.clearInterval(grens);
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
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "dark" ? "#0f0f0f" : "#ffffff"));
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || savedTheme() || systemTheme());
  const handmatig = useRef(false);
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => {
      if (!handmatig.current && !savedTheme()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  // Direct wisselen: geen kleurovergang op elk element (dat hapert), één repaint en klaar.
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    handmatig.current = true;
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
  zoeken,
}: {
  zoeken?: ReactNode;
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
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Nieuws in het kort
        </a>
        <div className="ctrls">
          <FocusSwitch value={bionic} onChange={onBionic} />
          {zoeken}
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

function Front({ children }: { children: ReactNode }) {
  const [enter] = useState(() => !introDone && !rustig());
  return <div className={`front ${enter ? "enter" : ""}`}>{children}</div>;
}

function Frame({ children, top, feed }: { children: ReactNode; top: ReactNode; feed?: boolean }) {
  return (
    <div className={`app ${feed ? "app-feed" : ""}`}>
      <IconSprite />
      {debug && <div style={{ position: "fixed", right: 4, top: 4, zIndex: 2147483647, background: "black", color: "white", padding: 4, fontSize: 10 }}>Afgewezen berichten: {afgewezenBerichten}</div>}
      <div className="shell">
        <a className="skip" href="#top" onClick={(e) => { e.preventDefault(); document.getElementById("top")?.focus(); }}>Naar de inhoud</a>
        {top}
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const { data: raw, error, reload } = useData();
  // Rustige melding i.p.v. stil falen: bijwerken mislukt, of de AI-dagruimte is (bijna) op.
  const briefNote = [
    error && raw ? "Bijwerken lukt even niet; je ziet het nieuws van de laatste keer." : "",
    raw?.uur?.ai === "op" ? "Samenvatten lukt even niet meer vandaag (dagruimte op). Nieuwe berichten staan er wel, met de tekst van de bron." : "",
  ].filter(Boolean).join(" ");
  UUR_ACTIEF.actief = Date.now() - Date.parse((raw as any)?.uur?.gegenereerd || "") < 2.5 * 3600e3; // alleen als de uur-run recent draaide
  const { theme, toggle } = useTheme();
  const catalog = useCatalog();
  const { off, setMany, reset } = useSourceFilter();
  const { groups, index } = useMemo(() => buildSources(catalog, raw), [catalog, raw]);
  const filtered = useFiltered(raw, index, off);
  const data = filtered?.data ?? null;
  const [route, setRoute] = useState<Route>(() => huidigeRoute());
  // Ook een direct gedeeld bericht kan buiten de gefilterde lijst staan.
  const selectedItem = route.selected
    ? data?.items.find((i) => (itemKey(i) === route.selected || artikelId(i) === route.selected)) ?? raw?.items.find((i) => (itemKey(i) === route.selected || artikelId(i) === route.selected)) ?? null
    : null;
  useLayoutEffect(() => { document.title = selectedItem ? `${selectedItem.kop} – Nieuws in het kort` : viewTitel(route.view); }, [route.view, selectedItem]);
  // Rubriekwissel (#538): alleen het paneel schuift 12px in, richting volgt de tabvolgorde; geen uitgaande animatie, een nieuwe wissel annuleert de lopende (animeer).
  const vorigeView = useRef(route.view);
  useLayoutEffect(() => {
    const van = vorigeView.current;
    vorigeView.current = route.view;
    const r = wisselRichting(van, route.view);
    const paneel = r && !route.selected ? document.getElementById("rubriek-paneel") : null;
    if (paneel) animeer(paneel, [{ opacity: 0, transform: `translateX(${r * 12}px)` }, { opacity: 1, transform: "none" }], { duration: DUUR[3], easing: "cubic-bezier(.05,.7,.1,1)" });
  }, [route.view, route.selected]);
  const [bionic, setBionic] = useState(() => leesFocusKeuze(browserStorage())); // lazy: geen flits van aan naar uit
  const [sheet, setSheet] = useState(false);
  const [fsheet, setFsheet] = useState(false);
  const sluitFilters = useCallback(() => setFsheet(false), []); // stabiel: FilterBlad herstelt anders focus bij elke filterwijziging (#623)
  const [zoekterm, setZoekterm] = useState("");
  const zoekInvoer = useRef<HTMLInputElement>(null);
  const flt = useFilters();
  const klok = useKlok(data, flt.f.tijd, flt.vorig);
  const videoKlok = useVideoKlok(route.video ? flt.f.tijd : "alles");
  const vids = useMemo(
    () => (data ? { filmpjes: filterVideos(data.filmpjes, flt.f, flt.vorig, data.gegenereerd), dumpert: filterVideos(data.dumpert, flt.f, flt.vorig, data.gegenereerd) } : null),
    [data, flt.f, flt.vorig, klok, videoKlok]
  );
  useVoorladen(vids, data?.gegenereerd, !!route.video); // thumbs vooraf in idle-tijd; video pas bij intentie (tab aanraken/focus)
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  const geveegd = useRef(false);
  useEffect(() => {
    ruimOudeFocusKeuzeOp(browserStorage());
    let volgnummer = 0;
    const onHash = async () => {
      const nummer = ++volgnummer;
      const next = huidigeRoute();
      const prev = routeRef.current;
      const back = prev.selected && !next.selected ? prev.selected : null;
      const veeg = geveegd.current;
      geveegd.current = false;
      const openen = !prev.selected && !!next.selected;
      const sluiten = !!back;
      const video = [prev.view, next.view].some((v) => v === "filmpjes" || v === "dumpert");
      if (openen && !video) {
        try { await laadDetail(); } catch { /* Suspense toont de bestaande foutafhandeling. */ }
        if (nummer !== volgnummer) return;
      }
      const update = () => { setFocusKey(back); setRoute(next); };
      if (kanOvergang(prev, next, veeg)) {
        void metOvergang(() => flushSync(update), openen ? "open" : "terug");
      }
      else {
        if (sluiten && (veeg || !video)) {
          flushSync(update);
          const overzicht = document.querySelector(".nf, main.wrap");
          if (overzicht) animeer(overzicht, [{ transform: "translateX(-24px)", opacity: 0.6 }, { transform: "translateX(0)", opacity: 1 }], { duration: DUUR[2] });
        }
        else startTransition(update);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => { volgnummer++; window.removeEventListener("hashchange", onHash); };
  }, []);

  // Scroll na het wisselen van pagina: naar boven bij detail, terug naar het bericht bij "terug".
  const prevSel = useRef(route.selected);
  useLayoutEffect(() => {
    const was = prevSel.current;
    prevSel.current = route.selected;
    if (was === route.selected) return;
    if (route.selected) window.scrollTo(0, 0);
    else if (was) {
      const n = document.querySelector<HTMLElement>(`[data-id="${CSS.escape(was)}"]`);
      if (n) {
        if (!n.closest(".nf")) n.scrollIntoView({ block: "center" });
        // Focus terug op de link/kaart waarmee het artikel opende (toetsenbord en schermlezer)
        const f = n instanceof HTMLAnchorElement ? n : n.querySelector<HTMLElement>("a[href]") ?? n;
        if (f === n && !n.hasAttribute("tabindex")) n.tabIndex = -1;
        f.focus({ preventScroll: true });
      } else {
        window.scrollTo(0, 0);
        // Zoekknop alleen als er echt gezocht wordt, anders de hoofdinhoud
        (document.querySelector<HTMLElement>('.zoek-knop[aria-expanded="true"]') ?? document.querySelector<HTMLElement>("main#top"))?.focus({ preventScroll: true });
      }
    }
  }, [route.selected]);

  useEffect(() => {
    if (data) introDone = true;
  }, [data]);

  const setBionicPersist = (v: boolean) => {
    setBionic(v);
    bewaarFocusKeuze(browserStorage(), v);
  };
  const setView = (v: View) => {
    // Touch: Filmpjes/Dumpert openen meteen de verticale feed (sluiten gaat naar het overzicht); desktop houdt het overzicht met kopjes.
    if ((v === "filmpjes" || v === "dumpert") && data && touchNu()) {
      // Filmpjes: start in Shorts (of Journaals als er geen shorts zijn); wisselen kan bovenin de feed.
      const fl = vids ?? data;
      const list = v === "filmpjes" ? fl.filmpjes.filter((x) => soortVan(x) === startSoort(fl.filmpjes)) : fl.dumpert;
      if (list.length) {
        feedNav.geopend(false);
        window.location.hash = `#/${v}/${encodeURIComponent(videoSlug(list[0]))}`;
        return;
      }
    }
    if (viewHash(v) === (window.location.hash || "#/")) return;
    window.location.hash = viewHash(v);
  };
  const openFeed = useCallback((cat: "filmpjes" | "dumpert", slug: string) => {
    feedNav.geopend(true);
    window.location.hash = `#/${cat}/${encodeURIComponent(slug)}`;
  }, []);
  const closeFeed = useCallback((cat: "filmpjes" | "dumpert") => {
    feedNav.sluit(cat);
  }, []);
  const open = useCallback((key: string) => {
    openedInside = true;
    window.location.hash = `#/bericht/${key}`;
  }, []);
  const goHome = () => {
    if (window.location.hash && window.location.hash !== "#/" && window.location.hash !== "#") window.location.hash = "#/";
    else {
      window.dispatchEvent(new Event("nf-top"));
      window.scrollTo({ top: 0, behavior: scrollGedrag() });
    }
  };

  const dateline = (
      <div className="dateline">
        <span className="date">{raw ? cap(raw.datum) : "\u00a0"}</span>
        {raw ? (
          <span className="upd">
            <i className={`live ${error ? "off" : ""}`} />
            {amsterdamTime(raw.gegenereerd) ? (
              <>
                Bijgewerkt om <span className="tnum">{amsterdamTime(raw.gegenereerd)}</span>
              </>
            ) : (
              "Bijgewerkt vandaag"
            )}
          </span>
        ) : null}
      </div>
  );
  const isFeedView = !!data && !route.selected && route.view !== "filmpjes" && route.view !== "dumpert";
  const zoekUitkomst = isFeedView && data && raw ? zoekItems(filterNieuws(route.view === "alles" ? (flt.f.cats.length ? data.items : data.items.filter((i) => i.cat !== "politiek")) : data.items.filter((i) => i.cat === route.view), flt.f, flt.vorig, raw.gegenereerd, route.view === "alles").items, zoekterm) : [];
  const top = (
    <>
      <TopBar theme={theme} onTheme={toggle} bionic={bionic} onBionic={setBionicPersist} onHome={goHome} onSources={() => setSheet(true)} filtered={off.size} zoeken={isFeedView ? <Zoekbalk query={zoekterm} onChange={setZoekterm} aantal={zoekUitkomst.length} invoer={zoekInvoer} /> : undefined} />
      {isFeedView ? null : dateline}
      {sheet ? (
        <Foutgrens code="CLIENT_SHEET"><Suspense fallback={null}>
          <SourcesSheet groups={groups} weer={raw?.weer?.bronnen ?? []} off={off} setMany={setMany} reset={reset} onClose={() => setSheet(false)} />
        </Suspense></Foutgrens>
      ) : null}
    </>
  );

  if (!data || !raw) {
    return (
      <Frame top={top}>
        <main className="wrap" id="top" tabIndex={-1}>
          <h1 className="sr-only">Nieuws</h1>
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

  if (selectedItem) {
    return (
      <Frame top={top}>
        <main className="wrap page-in" id="top" tabIndex={-1} key={`d-${route.selected}`}>
          <Suspense fallback={null}>
            <ArtikelDetail
              item={selectedItem}
              meerBronnen={off.size ? actieveBronnen(selectedItem, index, off) : undefined}
              dag={ams(Date.parse(raw.gegenereerd!)).iso}
              bionic={bionic}
              onBack={(opties) => {
                geveegd.current = !!opties?.geveegd;
                if (geveegd.current) setTimeout(() => { geveegd.current = false; }, 1000);
                if (openedInside || window.history.state?.binnen) window.history.back();
                else window.location.hash = "#/";
              }}
            />
          </Suspense>
          <Footer />
        </main>
      </Frame>
    );
  }

  const view = route.view;
  const isVideo = view === "filmpjes" || view === "dumpert";
  const kortSources = raw.items.reduce((n, a) => n + (a.bronnen?.length ?? 0), 0);
  const hidden = filtered?.hidden ?? 0;
  const filterNote = off.size ? (
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
  ) : null;
  const alles = view === "alles";
  const basisItems = alles ? (flt.f.cats.length ? data.items : data.items.filter((i) => i.cat !== "politiek")) : data.items.filter((i) => i.cat === view);
  const uitkomst = isVideo ? null : filterNieuws(basisItems, flt.f, flt.vorig, raw.gegenereerd, alles);
  const filterLeeg = <LeegMelding aantal={basisItems.length} onAanpassen={() => setFsheet(true)} onReset={flt.reset} />;
  const filterBalk = <FilterBalk u={uitkomst} f={flt.f} alles={alles} video={isVideo} onOpen={() => setFsheet(true)} />;
  const filterBlad = fsheet ? (
    <Foutgrens code="CLIENT_FILTER_SHEET"><Suspense fallback={null}>
      <FilterBlad f={flt.f} set={flt.set} reset={flt.reset} u={uitkomst} bron={basisItems} catBron={data.items} vorig={flt.vorig} alles={alles} video={isVideo} onClose={sluitFilters} />
    </Suspense></Foutgrens>
  ) : null;
  if (!isVideo) {
    return (
      <Frame top={top} feed>
        <main className="nf-main" id="top" tabIndex={-1}>
          <h1 className="sr-only">{alles ? "Nieuws" : view}</h1>
          <div className="nf-tabs">
            <div className="wrap">
              <Tabs data={data} view={view} onChange={setView} />
              {filterBalk}
              {filterNote}
            </div>
          </div>
          {filterBlad}
          <div id="rubriek-paneel" className="nf-panel" role="tabpanel">
          <Foutgrens key={view} code="CLIENT_FEED"><NewsFeed
            key={view}
            tab={view}
            items={zoekUitkomst}
            zoekterm={zoekterm}
            nieuwsdata={raw}
            keepOrder={flt.f.sort !== "nieuw"}
            empty={zoekterm.trim() ? <ZoekLeeg query={zoekterm} onWis={() => { setZoekterm(""); zoekInvoer.current?.focus(); }} /> : filterLeeg}
            bionic={bionic}
            focusKey={focusKey}
            onOpen={open}
            kompakt={kopKompact(alles)}
            samenvatting={!!raw.tab_samenvatting?.[view]?.tekst && basisItems.length > 0}
            head={
              <div className="wrap nc-head-in">
                {dateline}
                <Front>
                  {alles ? <Briefing text={raw.dag_samenvatting} bionic={bionic} sources={kortSources} time={amsterdamTime(raw.gegenereerd)} note={briefNote} /> : <TabBriefing text={raw.tab_samenvatting?.[view]?.tekst} aantal={basisItems.length}><Briefing text={raw.tab_samenvatting?.[view]?.tekst || ""} bionic={bionic} sources={0} time="" /></TabBriefing>}
                  {alles && <WeatherBox W={raw.weer} bionic={bionic} />}
                </Front>
              </div>
            }
          /></Foutgrens>
          </div>
        </main>
      </Frame>
    );
  }
  return (
    <Frame top={top}>
      <main className="wrap" id="top" tabIndex={-1}>
        <h1 className="sr-only">{view === "filmpjes" ? "Filmpjes" : "Dumpert"}</h1>
        <Front>
          <Briefing text={raw.dag_samenvatting} bionic={bionic} sources={kortSources} time={amsterdamTime(raw.gegenereerd)} note={briefNote} />
        </Front>
        <Tabs data={data} view={view} onChange={setView} />
        {filterBalk}
        {filterBlad}
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
        <div id="rubriek-paneel" role="tabpanel">
        {isVideo ? (
          <Foutgrens key={view} code="CLIENT_VIDEO"><Suspense fallback={null}>
            <VideoGrid
              key={view}
              cat={view}
              list={view === "filmpjes" ? vids!.filmpjes : vids!.dumpert}
              bionic={bionic}
              bronFilter={view === "filmpjes"}
              enter={!introDone && !rustig()}
              video={route.video}
              onOpen={(slug) => openFeed(view, slug)}
              onCloseFeed={() => closeFeed(view)}
            />
          </Suspense></Foutgrens>
        ) : (
          <NewsList
            key={view}
            view={view}
            items={uitkomst?.items ?? []}
            keepOrder={flt.f.sort !== "nieuw"}
            empty={filterLeeg}
            bionic={bionic}
            focusKey={focusKey}
            onOpen={open}
          />
        )}
        </div>
        <Footer />
      </main>
    </Frame>
  );
}
