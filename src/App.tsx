import { flushSync } from "react-dom";
import { Suspense,lazy,startTransition,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from "react";
import { useData,useTheme } from "./app-data";
import { Footer,Frame,Front,TopBar,UUR_ACTIEF } from "./app-frame";
import { intro } from "./app-status";
import { Briefing,Tabs } from "./app-tabs";
import { WeatherBox } from "./app-weer";
import { artikelId } from "./artikelid";
import { DUUR,animeer,kanOvergang,metOvergang,rustig,scrollGedrag } from "./beweging";
import { ArtikelDetail,laadDetail } from "./artikel-detail";
import { wisselRichting } from "./tabs";
import { FilterBalk,filterNieuws,filterVideos,useFilters } from "./filters";
import { bewaarFocusKeuze,browserStorage,leesFocusKeuze,ruimOudeFocusKeuzeOp } from "./focuslezen";
import { Foutgrens } from "./foutgrens";
import { Icon } from "./icons";
import { touchNu } from "./invoer";
import { LeegMelding } from "./leegmelding";
import { NewsFeed } from "./nieuws-feed";
import { amsterdamTime,cap,itemKey } from "./nieuws-hulp";
import { NewsList } from "./nieuws-lijst";
import { parseHash,viewHash,viewTitel,type Route } from "./route";
import { videoSlug } from "./slug";
import { buildSources,useCatalog,useFiltered,useSourceFilter } from "./sources";
import { TabBriefing,kopKompact } from "./tabbriefing";
import { ams } from "./tijd";
import type { View } from "./types";
import { useVoorladen } from "./usevoorladen";
import { soortVan,startSoort } from "./videosoort";
import { normaliseer,zoekItems } from "./zoek";
import { ZoekLeeg,Zoekbalk } from "./zoekbalk";



// Niet-kritiek: pas laden als het blad opengaat (docs/architectuur.md#chunk-indeling)
const SourcesSheet = lazy(() => import("./sheet").then((m) => ({ default: m.SourcesSheet })));

const VideoGrid = lazy(() => import("./video").then((m) => ({ default: m.VideoGrid })));


const FilterBlad = lazy(() => import("./filters-blad").then((m) => ({ default: m.FilterBlad })));




let openedInside = false;

// feed geopend vanuit het overzicht (dan is sluiten = history.back())
let feedPushed = false;


// De oude Alles-route vervangen zonder een extra geschiedenisitem.
function huidigeRoute(): Route {
  if (window.location.hash === "#/alles") {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#/`);
  }
  return parseHash(window.location.hash);
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
  useLayoutEffect(() => { document.title = viewTitel(route.view); }, [route.view, route.selected]);
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
  const [zoekterm, setZoekterm] = useState("");
  const flt = useFilters();
  const vids = useMemo(
    () => (data ? { filmpjes: filterVideos(data.filmpjes, flt.f, flt.vorig, data.gegenereerd), dumpert: filterVideos(data.dumpert, flt.f, flt.vorig, data.gegenereerd) } : null),
    [data, flt.f, flt.vorig]
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
        n.scrollIntoView({ block: "center" });
        // Focus terug op de link/kaart waarmee het artikel opende (toetsenbord en schermlezer)
        const f = n instanceof HTMLAnchorElement ? n : n.querySelector<HTMLElement>("a[href]") ?? n;
        if (f === n && !n.hasAttribute("tabindex")) n.tabIndex = -1;
        f.focus({ preventScroll: true });
      } else window.scrollTo(0, 0);
    }
  }, [route.selected]);

  useEffect(() => {
    if (data) intro.done = true;
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
      <TopBar theme={theme} onTheme={toggle} bionic={bionic} onBionic={setBionicPersist} onHome={goHome} onSources={() => setSheet(true)} filtered={off.size} zoeken={isFeedView ? <Zoekbalk query={zoekterm} onChange={setZoekterm} aantal={zoekUitkomst.length} /> : undefined} />
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

  // Detail: eerst in de gefilterde lijst (met alleen de actieve bronnen), anders het origineel (directe link).
  const selectedItem = route.selected
    ? data.items.find((i) => (itemKey(i) === route.selected || artikelId(i) === route.selected)) ?? raw.items.find((i) => (itemKey(i) === route.selected || artikelId(i) === route.selected)) ?? null
    : null;

  if (selectedItem) {
    return (
      <Frame top={top}>
        <main className="wrap page-in" id="top" tabIndex={-1} key={`d-${route.selected}`}>
          <Suspense fallback={null}>
            <ArtikelDetail
              item={selectedItem}
              dag={ams(raw.gegenereerd ? Date.parse(raw.gegenereerd) : Date.now()).iso}
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
      <FilterBlad f={flt.f} set={flt.set} reset={flt.reset} u={uitkomst} bron={basisItems} catBron={data.items} vorig={flt.vorig} alles={alles} video={isVideo} onClose={() => setFsheet(false)} />
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
            items={zoekUitkomst}
            keepOrder={flt.f.sort !== "nieuw"}
            empty={normaliseer(zoekterm) ? <ZoekLeeg query={zoekterm} onWis={() => setZoekterm("")} /> : filterLeeg}
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
              enter={!intro.done && !rustig()}
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
