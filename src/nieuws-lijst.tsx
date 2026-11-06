import { laadDetail } from "./artikel-detail";
import { memo, useMemo, useState, type ReactNode } from "react";
import { intro } from "./app-status";
import { Beelden, Thumb } from "./beelden";
import { rustig } from "./beweging";
import { Icon } from "./icons";
import { bronnenTekst, fotos } from "./leesverder";
import { bronLabel, itemKey, pickLead, sortItems } from "./nieuws-hulp";
import { CAT_LABEL } from "./tabs";
import type { Item, View } from "./types";
import { BionicText } from "./ui";

const ALLES_FIRST = 24; // op "Home" eerst zoveel kaarten, daarna "Toon alle"

export type OpenFn = (k: string) => void;

export function useOpen(key: string, onOpen: OpenFn) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(key);
  };
}

export const LeadStory = memo(function LeadStory({ item, bionic, enter, onOpen }: { item: Item; bionic: boolean; enter: boolean; onOpen: OpenFn }) {
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

export const NewsRow = memo(function NewsRow({ item, i, bionic, enter, onOpen }: { item: Item; i: number; bionic: boolean; enter: boolean; onOpen: OpenFn }) {
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

export function NewsList({ items, view, bionic, focusKey, onOpen, keepOrder, empty }: { items: Item[]; view: View; bionic: boolean; focusKey: string | null; onOpen: OpenFn; keepOrder?: boolean; empty?: ReactNode }) {
  const [enter] = useState(() => !intro.done && !rustig());
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
