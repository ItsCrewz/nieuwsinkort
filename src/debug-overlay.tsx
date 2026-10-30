import { useEffect, useState } from "react";
import { videoEvents } from "./debug";

export const balkTijden = new WeakMap<HTMLVideoElement, () => number>();
const getal = (n: number) => Number.isFinite(n) ? n.toFixed(1) : "-";

export function DebugOverlay() {
  const [tekst, zetTekst] = useState("");
  useEffect(() => {
    const update = () => {
      const videos = Array.from(document.querySelectorAll("video"));
      const diag = (window as unknown as { __nikVideo?: { stil: number; vast: number; herladen: number } }).__nikVideo;
      const ios = navigator.userAgent.match(/(?:iPhone OS|CPU OS) ([\d_]+)/)?.[1].replace(/_/g, ".") || navigator.userAgent.slice(0, 45);
      const regels = videos.map((v, i) => {
        const slide = v.closest<HTMLElement>(".fslide");
        const actief = slide?.getAttribute("aria-current") === "true";
        const bron = v.getAttribute("src") || v.currentSrc || "";
        const type = v.dataset.mse === "1" ? "hls.js-MSE" : v.dataset.debugKind === "hls" ? "native HLS" : "mp4";
        const buffer = Array.from({ length: v.buffered.length }, (_, j) => `${getal(v.buffered.start(j))}–${getal(v.buffered.end(j))}`).join(",") || "-";
        const balk = balkTijden.get(v)?.();
        return `#${i} slide ${slide?.dataset.i ?? "-"} actief ${actief ? "ja" : "nee"} ${type}\n src ${bron.slice(0, 65) || "-"}\n paused ${v.paused} ready ${v.readyState} net ${v.networkState} tijd ${getal(v.currentTime)}/${getal(v.duration)}\n buffer ${buffer}${actief && balk !== undefined ? `\n balk ${getal(balk)} drift ${getal(balk - v.currentTime)}` : ""}`;
      });
      zetTekst(`iOS/UA: ${ios}\nstil ${diag?.stil ?? 0} vast ${diag?.vast ?? 0} herladen ${diag?.herladen ?? 0}\nvideo's ${videos.length}, met src ${videos.filter((v) => v.getAttribute("src") || v.currentSrc).length}\n${regels.join("\n")}\nEvents:\n${videoEvents.lijst().join("\n")}`);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, []);
  return <div data-testid="video-debug" style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 4px)", left: 4, zIndex: 2147483647, background: "rgba(0,0,0,.78)", color: "white", font: "10px/1.2 monospace", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "90vw", maxHeight: "85vh", overflow: "hidden", padding: 4, pointerEvents: "none" }}>{tekst}</div>;
}
