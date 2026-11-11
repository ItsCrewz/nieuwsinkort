import { useEffect, useState } from "react";
import { tijdstip, type Tijd } from "./filters";
import { midnight } from "./tijd";
import { publicatieTijd } from "./vandaag";
import type { Item, Video } from "./types";

type Klokdata = { items: Item[]; filmpjes: Video[]; dumpert: Video[]; gegenereerd?: string };

export function volgendeGrens(data: Klokdata, tijd: Tijd, vorig: number, nu: number): number {
  const gen = Date.parse(data.gegenereerd || "") || nu;
  let grens = midnight(midnight(nu) + 36 * 3600e3);
  const voegToe = (t: number) => { if (t > nu && t < grens) grens = t; };
  if (tijd === "auto" && vorig) voegToe(vorig + 24 * 3600e3);
  for (const item of data.items) {
    const t = typeof item.t === "number" && item.t > 0 && Number.isFinite(new Date(item.t).getTime()) ? item.t : tijdstip(item.tijd, gen);
    if (t != null) for (const duur of [3600e3, 3 * 3600e3]) voegToe(t + duur + 1);
  }
  if (tijd === "1u" || tijd === "3u") {
    const duur = tijd === "1u" ? 3600e3 : 3 * 3600e3;
    for (const video of [...data.filmpjes, ...data.dumpert]) {
      const t = publicatieTijd(video.t, nu) ?? (video.gisteren ? null : tijdstip(video.tijd, gen));
      if (t != null) voegToe(t + duur + 1);
    }
  }
  return grens;
}

export function useKlok(data: Klokdata | null, tijd: Tijd, vorig: number) {
  const [versie, ververs] = useState(0);
  useEffect(() => {
    if (!data) return;
    let timer = 0;
    const plan = () => {
      window.clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(() => ververs((n) => n + 1), Math.min(volgendeGrens(data, tijd, vorig, Date.now()) - Date.now(), 2147483647));
    };
    const zichtbaar = () => { if (document.hidden) window.clearTimeout(timer); else ververs((n) => n + 1); };
    plan();
    document.addEventListener("visibilitychange", zichtbaar);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", zichtbaar); };
  }, [data, tijd, vorig, versie]);
  return versie;
}
