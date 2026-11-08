#!/usr/bin/env python3
"""Haalt het weer voor Haarlem op en print het WEER-object (JSON) voor de Dagelijks Nieuws-Page.

Bronnen: Buienradar JSON (meting dichtstbijzijnde station + 5-daagse), KNMI (weerbericht +
waarschuwingen Noord-Holland), Open-Meteo als terugval. Getallen worden nooit verzonnen:
lukt een bron niet, dan blijft het veld weg/leeg.

Gebruik:  python3 weer.py            -> WEER-JSON op stdout
          python3 weer.py --raw      -> ook de volledige KNMI-tekst e.d. onder "_raw"
De volledige KNMI-tekst staat ook altijd in /workspace/nieuws/weer_raw.json, zodat de
routine 'verwachting' in simpele taal kan herschrijven.
"""
import html, json, math, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Amsterdam")
LAT, LON = 52.38, 4.64
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
BR_URL = "https://data.buienradar.nl/2.0/feed/json"
OM_URL = ("https://api.open-meteo.com/v1/forecast?latitude=52.38&longitude=4.64"
          "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m"
          "&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code,"
          "wind_speed_10m_max,wind_direction_10m_dominant&timezone=Europe%2FAmsterdam&forecast_days=4"
          "&wind_speed_unit=ms")
KNMI_VERW = "https://www.knmi.nl/nederland-nu/weer/verwachtingen"
KNMI_WAARSCH = "https://www.knmi.nl/nederland-nu/weer/waarschuwingen/noord-holland"
DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]
WMO = {0: "Zonnig", 1: "Overwegend zonnig", 2: "Half bewolkt", 3: "Bewolkt", 45: "Mist", 48: "Mist",
       51: "Motregen", 53: "Motregen", 55: "Motregen", 56: "IJzel", 57: "IJzel", 61: "Lichte regen",
       63: "Regen", 65: "Zware regen", 66: "IJzel", 67: "IJzel", 71: "Lichte sneeuw", 73: "Sneeuw",
       75: "Zware sneeuw", 77: "Sneeuw", 80: "Buien", 81: "Buien", 82: "Zware buien", 85: "Sneeuwbuien",
       86: "Sneeuwbuien", 95: "Onweer", 96: "Onweer met hagel", 99: "Onweer met hagel"}


def get(url, as_json=False, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "nl-NL,nl;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read().decode("utf-8", "replace")
    return json.loads(data) if as_json else data


def safe(fn):
    try:
        return fn()
    except Exception as e:  # noqa
        sys.stderr.write(f"[weer.py] {fn.__name__ if hasattr(fn,'__name__') else fn}: {e}\n")
        return None


def page_text(h):
    h = re.sub(r"<script.*?</script>|<style.*?</style>", " ", h, flags=re.S | re.I)
    h = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h\d>", "\n", h, flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", h))
    return re.sub(r"[ \t\xa0]+", " ", t)


def kort(desc):
    d = (desc or "").lower()
    rules = [("onweer", "Onweer"), ("hagel", "Hagel"), ("sneeuw", "Sneeuw"), ("ijzel", "IJzel"),
             ("motregen", "Motregen"), ("bui", "Buien"), ("regen", "Regen"), ("mist", "Mist"),
             ("nevel", "Nevel"), ("zwaar bewolkt", "Bewolkt"), ("geheel bewolkt", "Bewolkt"),
             ("opklaring", "Half bewolkt"), ("half bewolkt", "Half bewolkt"),
             ("licht bewolkt", "Licht bewolkt"), ("zonnig", "Zonnig"), ("helder", "Helder"),
             ("bewolkt", "Bewolkt")]
    for k, v in rules:
        if k in d:
            return v
    return (desc or "").strip()


def windrichting(deg):
    names = ["N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO", "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW"]
    return names[int((deg % 360) / 22.5 + 0.5) % 16]


def bft(ms):
    grens = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]
    for i, g in enumerate(grens):
        if ms < g:
            return i
    return 12


def rond(x):
    return None if x is None else int(math.floor(float(x) + 0.5))


def dist(a, b, c, d):
    return math.hypot((a - c) * 111, (b - d) * 111 * math.cos(math.radians(a)))


def knmi_waarschuwing(t):
    """Zoekt de zwaarste KNMI-code op de Noord-Holland-pagina; '' als er geen is."""
    codes = re.findall(r"[Cc]ode (geel|oranje|rood)", t)
    if not codes:
        return ""
    ernst = {"geel": 1, "oranje": 2, "rood": 3}
    zwaarst = max(codes, key=lambda c: ernst[c])
    m = re.search(r"[Cc]ode " + zwaarst + r"\s*[:.\-]?\s*(.{0,220}?[.!])", t)
    uitleg = m.group(1).strip() if m else ""
    return f"Code {zwaarst}" + (f": {uitleg}" if uitleg else "")


def main():
    with ThreadPoolExecutor(4) as ex:
        f_br = ex.submit(safe, lambda: get(BR_URL, True))
        f_om = ex.submit(safe, lambda: get(OM_URL, True))
        f_kv = ex.submit(safe, lambda: get(KNMI_VERW))
        f_kw = ex.submit(safe, lambda: get(KNMI_WAARSCH))
        br, om, kv, kw = f_br.result(), f_om.result(), f_kv.result(), f_kw.result()

    nu_dt = datetime.now(TZ)
    weer = {"plaats": "Haarlem", "bijgewerkt": nu_dt.strftime("%H:%M")}
    bronnen, raw = [], {}

    # --- Nu: dichtstbijzijnde Buienradar-station met temperatuur ---
    nu = {}
    if br:
        st = [s for s in br.get("actual", {}).get("stationmeasurements", []) if s.get("temperature") is not None]
        st.sort(key=lambda s: dist(LAT, LON, s["lat"], s["lon"]))
        if st:
            s = st[0]
            nu["temp"] = rond(s["temperature"])
            if s.get("feeltemperature") is not None:
                nu["gevoel"] = rond(s["feeltemperature"])
            if s.get("weatherdescription"):
                nu["omschrijving"] = kort(s["weatherdescription"])
            raw["station"] = {k: s.get(k) for k in ("stationname", "timestamp", "temperature", "feeltemperature",
                                                     "weatherdescription", "winddirection", "windspeedBft")}
            bronnen.append({"site": f"Buienradar ({s['stationname'].replace('Meetstation ', '')})",
                            "href": "https://www.buienradar.nl/weer/haarlem/nl/2754669"})
    if om and om.get("current"):
        c = om["current"]
        nu.setdefault("temp", rond(c.get("temperature_2m")))
        nu.setdefault("gevoel", rond(c.get("apparent_temperature")))
        if c.get("weather_code") in WMO:
            nu.setdefault("omschrijving", WMO[c["weather_code"]])
    nu = {k: v for k, v in nu.items() if v is not None}
    if nu:
        weer["nu"] = nu

    # --- Vandaag + komende dagen ---
    vandaag, dagen = {}, []
    br_days = {}
    if br:
        for d in br.get("forecast", {}).get("fivedayforecast", []):
            br_days[d["day"][:10]] = d
    om_days = {}
    if om and om.get("daily"):
        dd = om["daily"]
        for i, t in enumerate(dd["time"]):
            om_days[t] = {k: dd[k][i] for k in dd if k != "time"}
    vandaag_iso = nu_dt.date().isoformat()
    b, o = br_days.get(vandaag_iso), om_days.get(vandaag_iso)
    if b:
        vandaag["min"] = rond(b.get("mintemperatureMin", b.get("mintemperature")))
        vandaag["max"] = rond(b.get("maxtemperatureMax", b.get("maxtemperature")))
        if b.get("rainChance") is not None:
            vandaag["neerslagkans"] = int(b["rainChance"])
        if b.get("wind") and b.get("windDirection"):
            vandaag["wind"] = f"{b['windDirection'].upper()} {int(b['wind'])} Bft"
    if o:
        if vandaag.get("min") is None and o.get("temperature_2m_min") is not None:
            vandaag["min"] = rond(o["temperature_2m_min"])
        if vandaag.get("max") is None and o.get("temperature_2m_max") is not None:
            vandaag["max"] = rond(o["temperature_2m_max"])
        if "neerslagkans" not in vandaag and o.get("precipitation_probability_max") is not None:
            vandaag["neerslagkans"] = int(o["precipitation_probability_max"])
        if "wind" not in vandaag and o.get("wind_speed_10m_max") is not None and o.get("wind_direction_10m_dominant") is not None:
            vandaag["wind"] = f"{windrichting(o['wind_direction_10m_dominant'])} {bft(o['wind_speed_10m_max'])} Bft"
    vandaag = {k: v for k, v in vandaag.items() if v is not None}
    if vandaag:
        weer["vandaag"] = vandaag

    alle = sorted(set(br_days) | set(om_days))
    for iso in [d for d in alle if d > vandaag_iso][:3]:
        b, o = br_days.get(iso), om_days.get(iso)
        dag = {"dag": DAGEN[date.fromisoformat(iso).weekday()]}
        if b:
            dag["min"] = rond(b.get("mintemperatureMin", b.get("mintemperature")))
            dag["max"] = rond(b.get("maxtemperatureMax", b.get("maxtemperature")))
            dag["omschrijving"] = kort(b.get("weatherdescription"))
        elif o:
            dag["min"] = rond(o.get("temperature_2m_min"))
            dag["max"] = rond(o.get("temperature_2m_max"))
            dag["omschrijving"] = WMO.get(o.get("weather_code"), "")
        dag = {k: v for k, v in dag.items() if v not in (None, "")}
        if "min" in dag and "max" in dag:
            dagen.append(dag)
    if dagen:
        weer["dagen"] = dagen
    if om and (o or om_days):
        bronnen.append({"site": "Open-Meteo", "href": "https://open-meteo.com/en/docs?latitude=52.38&longitude=4.64"})

    # --- KNMI weerbericht ---
    verwachting = ""
    if kv:
        t = page_text(kv)
        m = re.search(r"Vandaag & morgen\s*(.*?)\(Bron: KNMI\)", t, re.S)
        if m:
            tekst = re.sub(r"\s+", " ", m.group(1)).strip()
            tekst = re.sub(r"Waarschuwingen\s+Er zijn geen waarschuwingen\.\s*", "", tekst)
            raw["knmi_weerbericht"] = tekst
            zinnen = re.split(r"(?<=[.!?])\s+", tekst)
            verwachting = " ".join(zinnen[:3]).strip()
            bronnen.append({"site": "KNMI", "href": KNMI_VERW})
    if not verwachting and br:
        rep = br.get("forecast", {}).get("weatherreport", {})
        txt = re.sub(r"\s+", " ", page_text(rep.get("summary") or rep.get("text") or "")).strip()
        if txt:
            raw["buienradar_weerbericht"] = txt
            verwachting = " ".join(re.split(r"(?<=[.!?])\s+", txt)[:3])
    weer["verwachting"] = verwachting
    if br:
        rep = br.get("forecast", {}).get("weatherreport", {})
        if rep.get("text"):
            raw["buienradar_weerbericht_volledig"] = re.sub(r"\s+", " ", page_text(rep["text"])).strip()

    # --- KNMI waarschuwing Noord-Holland ---
    waarschuwing = ""
    if kw:
        t = re.sub(r"\s+", " ", page_text(kw))
        raw["knmi_waarschuwing_pagina"] = t[:1500]
        waarschuwing = knmi_waarschuwing(t)
        if not any(b["site"] == "KNMI" for b in bronnen):
            bronnen.append({"site": "KNMI", "href": KNMI_WAARSCH})
        bronnen.append({"site": "KNMI waarschuwingen", "href": KNMI_WAARSCH})
    weer["waarschuwing"] = waarschuwing
    weer.setdefault("dagen", [])
    weer["bronnen"] = bronnen

    try:
        with open("/workspace/nieuws/weer_raw.json", "w") as f:
            json.dump({"WEER": weer, "raw": raw}, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    out = dict(weer)
    if "--raw" in sys.argv:
        out["_raw"] = raw
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
