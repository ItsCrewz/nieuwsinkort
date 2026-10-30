import { useEffect, useState } from "react";
import { videoEvents } from "./debug";
import { ytStatusNaam } from "./ytstart";

export const balkTijden = new WeakMap<HTMLVideoElement, () => number>();
export type FrameDebug = { gepresenteerd: number; gedecodeerd: number; op: number; mediaTijd: number; rvfc: boolean; decode: boolean; gen: number };
export const frameTijden = new WeakMap<HTMLVideoElement, () => FrameDebug>();
const getal = (n: number) => Number.isFinite(n) ? n.toFixed(1) : "-";

/** Beeldregel voor de overlay: afmetingen, tellers en leeftijd van het laatste beeld. */
export function frameRegel(breedte: number, hoogte: number, f: FrameDebug | undefined, nu: number): string {
  const maat = `${breedte}x${hoogte}`;
  if (!f) return ` beeld ${maat} frames -`;
  const teller = f.rvfc ? (f.decode ? "rvfc+dec" : "rvfc") : f.decode ? "dec" : "geen";
  return ` beeld ${maat} gen ${f.gen} ${teller} frames ${f.gepresenteerd}/${f.gedecodeerd} laatste ${getal((nu - f.op) / 1000)}s pts ${getal(f.mediaTijd)}`;
}

export function DebugOverlay() {
  const [tekst, zetTekst] = useState("");
  useEffect(() => {
    const update = () => {
      const nu = performance.now();
      const videos = Array.from(document.querySelectorAll("video"));
      const diag = (window as unknown as { __nikVideo?: { stil: number; vast: number; herladen: number } }).__nikVideo;
      const ios = navigator.userAgent.match(/(?:iPhone OS|CPU OS) ([\d_]+)/)?.[1].replace(/_/g, ".") || navigator.userAgent.slice(0, 45);
      const regels = videos.map((v, i) => {
        const slide = v.closest<HTMLElement>(".fslide");
        const actief = slide?.getAttribute("aria-current") === "true";
        const type = v.dataset.mse === "1" ? "hls.js-MSE" : v.dataset.debugKind === "hls" ? "native HLS" : "mp4";
        const buffer = Array.from({ length: v.buffered.length }, (_, j) => `${getal(v.buffered.start(j))}–${getal(v.buffered.end(j))}`).join(",") || "-";
        const balk = balkTijden.get(v)?.();
        return `#${i} slot ${v.dataset.slot ?? "-"} slide ${slide?.dataset.i ?? "geparkeerd"} actief ${actief ? "ja" : "nee"} ${type}\n src ${(v.getAttribute("src") || "-").slice(0, 60)}\n cur ${(v.currentSrc || "-").slice(0, 60)}\n paused ${v.paused} muted ${v.muted} seeking ${v.seeking} ready ${v.readyState} net ${v.networkState} tijd ${getal(v.currentTime)}/${getal(v.duration)}\n${frameRegel(v.videoWidth, v.videoHeight, frameTijden.get(v)?.(), nu)}\n buffer ${buffer}${actief && balk !== undefined ? `\n balk ${getal(balk)} drift ${getal(balk - v.currentTime)}` : ""}`;
      });
      const pool = videos.filter((v) => v.dataset.slot !== undefined).sort((a, b) => Number(a.dataset.slot) - Number(b.dataset.slot))
        .map((v) => `${v.dataset.slot}→${v.closest<HTMLElement>(".fslide")?.dataset.i ?? "-"}(${v.getAttribute("src") ? (v.dataset.mse === "1" ? "MSE" : v.dataset.debugKind === "hls" ? "HLS" : "mp4") : "leeg"})`).join(" ");
      // Alleen het src-attribuut telt als bron; een oud currentSrc na load() blijft soms staan.
      const metSrc = videos.filter((v) => v.getAttribute("src")).length;
      const metCur = videos.filter((v) => v.currentSrc).length;
      const yt = document.querySelector<HTMLIFrameElement>('.fslide[aria-current="true"] iframe.f-yt');
      const status = yt?.dataset.ytStatus ? Number(yt.dataset.ytStatus) : null;
      const ytId = yt?.getAttribute("src")?.split("/embed/")[1]?.split("?")[0] ?? "-";
      const ytRegel = yt ? `YouTube ${ytId} status ${status ?? "-"} ${ytStatusNaam(status)} onReady ${yt.dataset.ytReady === "true" ? "ja" : "nee"} pogingen ${yt.dataset.ytPogingen ?? "0"} vangnet ${yt.dataset.ytVangnet ?? "nee"}\n` : "";
      zetTekst(`iOS/UA: ${ios}\nstil ${diag?.stil ?? 0} vast ${diag?.vast ?? 0} herladen ${diag?.herladen ?? 0}\npool ${pool}\n${ytRegel}video's ${videos.length}, src-attribuut ${metSrc}, currentSrc ${metCur}\n${regels.join("\n")}\nEvents:\n${videoEvents.lijst().join("\n")}`);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, []);
  return <div data-testid="video-debug" style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 4px)", left: 4, zIndex: 2147483647, background: "rgba(0,0,0,.78)", color: "white", font: "10px/1.2 monospace", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "90vw", maxHeight: "85vh", overflow: "hidden", padding: 4, pointerEvents: "none" }}>{tekst}</div>;
}
