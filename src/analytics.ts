const SITE_TOKEN = "842ae4495adb4d36b6c6fdb5100e43c3";

export function startAnalytics(token = SITE_TOKEN): void {
  const url = new URL(window.location.href);
  const keuze = url.searchParams.get("nietmeten");
  let uit = keuze === "1";
  let opgeslagen = false;
  try {
    if (keuze === "1") localStorage.setItem("nik_nietmeten", "1");
    if (keuze === "0") localStorage.removeItem("nik_nietmeten");
    uit = localStorage.getItem("nik_nietmeten") === "1";
    opgeslagen = true;
  } catch { /* De URL bewaart de keuze zolang opslag ontbreekt. */ }
  if (keuze === "1" || keuze === "0") {
    if (opgeslagen || keuze === "0") {
      url.searchParams.delete("nietmeten");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
    if (opgeslagen) {
      const melding = document.createElement("div");
      melding.style.cssText = "position:fixed;z-index:1000;bottom:1rem;left:50%;transform:translateX(-50%);padding:.6rem 1rem;border-radius:.5rem;background:#222;color:#fff;font-size:.875rem;text-align:center";
      melding.setAttribute("role", "status");
      melding.textContent = uit ? "Je bezoeken worden niet meer meegeteld" : "Je bezoeken worden weer meegeteld";
      document.body.appendChild(melding);
      window.setTimeout(() => melding.remove(), 3000);
    } else if (uit) {
      const melding = document.createElement("div");
      melding.style.cssText = "position:fixed;z-index:1000;bottom:1rem;left:50%;transform:translateX(-50%);padding:.6rem 1rem;border-radius:.5rem;background:#222;color:#fff;font-size:.875rem;text-align:center";
      melding.setAttribute("role", "status");
      melding.textContent = "Je bezoek wordt niet meegeteld. Opslag is geblokkeerd: op een andere pagina moet je de keuze opnieuw maken met ?nietmeten=1. ";
      const knop = document.createElement("button");
      knop.textContent = "Verder";
      knop.addEventListener("click", () => melding.remove());
      melding.appendChild(knop);
      document.body.appendChild(melding);
    }
  }
  if (!uit && token && !document.querySelector('script[src*="cloudflareinsights.com"], script[data-cf-beacon]')) {
    const script = document.createElement("script");
    script.defer = true;
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.setAttribute("data-cf-beacon", JSON.stringify({ token }));
    document.head.appendChild(script);
  }
}
