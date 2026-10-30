#!/usr/bin/env python3
"""Kandidaten voor de tabbladen 'Filmpjes' (nieuwsfilmpjes) en 'Dumpert' op de Dagelijks Nieuws-Page.

Gebruik:
  python3 filmpjes.py              -> JSON {"filmpjes": [...], "dumpert": [...], "status": {...}}
  python3 filmpjes.py --dumpert    -> alleen de Dumpert-lijst
  python3 filmpjes.py --filmpjes   -> alleen de nieuwsfilmpjes
  python3 filmpjes.py --uren 24    -> tijdvenster van N uur terug i.p.v. de standaard
                                      (standaard: vanaf 00:00 vandaag, Europe/Amsterdam)

Velden per filmpje: titel, ai, bron, href, embed, thumb, populariteit, tijd (HH:MM Europe/Amsterdam),
embed = afspeel-URL: Dumpert HLS-stream (.m3u8), X MP4 (via x_embed() op de
media van de X-tools), YouTube youtube-nocookie-embed (een Canvas staat geen <iframe> toe, dus YouTube
speelt daar niet af en de Page valt terug op de link; de Page speelt alleen .m3u8/.mp4 af in <video>).
plus hulpvelden _kanaal, _score, _gepubliceerd (weghalen voor de Page). 'ai' is ruwe brontekst
(beschrijving); de routine maakt er één korte, neutrale zin van en filtert op echt nieuws.

Bronnen:
  Dumpert   www.dumpert.nl/toppers (embedded JSON; de mobile_api zit achter Cloudflare 403)
  YouTube   kanaal-RSS van nieuwskanalen (met views uit media:statistics)
  X         niet in dit script: gebruik de X-tools (has:videos, nieuwsaccounts), zie status.
  YouTube trending NL via Invidious: overgeslagen (geeft alleen livestreams met 0 views).
  Instagram profiel-embed van instagram.com (openbaar, zonder login): reels van vandaag met MP4, soort "short".
  TikTok: geen snelle open route; overgeslagen.
Elk filmpje krijgt "soort": "short" (Shorts, Reels, X) of "journaal" (uitzending/reportage).
"""
import html, json, re, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Amsterdam")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

YT_NIEUWS = {  # kanaalnaam -> channel_id
    "NOS": "UC5xziMuoFAOpX9mwUVhe2Jw",
    "RTL Nieuws": "UCv4NUJ5BGSpJz_leIfayDzQ",
    "NU.nl": "UCCw1aOc9x3sEjrUzT-qmMGw",
    "Hart van Nederland": "UCgOkhebo_ZU8rawIXsbyPXQ",
    "RTL Boulevard": "UC2Jbya_u-rQ0xBNHBYXvpTg",
    "Shownieuws": "UCnZkUwDLBgLFEpXSeyEx3YA",
    "NH Nieuws": "UCSpctzQgGRJV84At2dV73qg",
    "PowNews": "UCHTtspK-G7Wt68awRpTSkiw",
    "WNL": "UCUSrVHoJrz68z3Q5qHZZC4w",
    "EenVandaag": "UCjxk-pBIdYXjBQGie4uJGoA",
    "RTL Z": "UC3lleI2WsaIiW8IzkJ0kIYA",
    "BNR": "UCWALr0VavEm8SgPXGafhFDQ",
    "NOS Stories": "UCoakeH4bmdUYtptWdmoUrRQ",
    "Nieuwsuur": "UCExcZNwh_3Mwm4fF4VSiu2w",
    "Omroep PowNed": "UCihqgpWn_ns1gJUdhNLsSMQ",
    "Radar": "UCGUhzuD1eYIgJoSGe0c_rNg",
    "NOS Sport": "UCT4oPufBQa0f6C67Fw_HXNg",
    "Ziggo Sport": "UCueOZEvMffxjJyVO1fGiJNQ",
    "ESPN NL": "UCXnPiEv1DoUCDAqDUXT9shQ",
    "OnsOranje": "UCpnmJcBhJqKIHFkKvgdkdMQ",
    "FORMULA 1": "UCB_qr75-ydFVKSF9Dmo6izg",
    "AutoWeek": "UCzToShYR6Sw_k1i6FsdEr6g",
    "Autovisie": "UCAkqAwuyz_qu3vfgAMQPCBw",
}
# Instagram: profiel-embed van Instagram zelf (openbaar, zonder login); Kittygram geeft geen media.
IG_ACCOUNTS = {
    "NOS": "nos", "NU.nl": "nu.nl", "RTL Nieuws": "rtlnieuws", "NH Nieuws": "nhnieuws", "Haarlem105": "haarlem105",
    "PowNed": "powned", "Hart van Nederland": "hartvannederland", "RTL Boulevard": "rtlboulevard",
}
# Politiek (Tweede Kamer-partijen, lijsttrekkers, kabinet): uit feeds.json (cat "politiek"), max 2 video's per account.
def _politiek():
    ig, yt = {}, {}
    try:
        for f in json.load(open("/workspace/nieuws/feeds.json")):
            if f.get("cat") != "politiek" or not f.get("werkt", True):
                continue
            n = re.sub(r"\s*\((Kittygram|YouTube|X)\)$", "", f.get("naam", ""))
            m = re.match(r"https://kg\.meowing\.de/([^/]+)/atom\.xml", f.get("url", ""))
            if m:
                ig[n] = m.group(1)
            m = re.search(r"channel_id=([\w-]+)", f.get("url", ""))
            if m:
                yt[n] = m.group(1)
    except Exception:
        pass
    return ig, yt
IG_POLITIEK, YT_POLITIEK = _politiek()
IG_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
         "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
# Shorts vs. Journaals (zelfde regels als worker/src/videos.ts soortVan en de site)
JOURNAAL_RE = re.compile(r"journaal|nieuwsuitzending|\buitzending\b|bulletin|nieuwsoverzicht|het nieuws van|"
                         r"nieuws van (de dag|vandaag)|\b(nos|rtl) nieuws (om )?\d{1,2}[:.]\d{2}|\b(8|20|18|19)[:.]00 ?uur", re.I)


def soort_van(f):
    """'journaal' = uitzending/reportage (liggend, langer); 'short' = kort clipje (YouTube Shorts, Reels, X)."""
    if f.get("soort") in ("short", "journaal"):
        return f["soort"]
    if JOURNAAL_RE.search(f.get("titel") or ""):
        return "journaal"
    u = f"{f.get('href') or ''} {f.get('embed') or ''}"
    if re.search(r"youtube\.com/shorts/", u, re.I):
        return "short"
    if re.search(r"youtube(?:-nocookie)?\.com/(?:watch|embed|live)|youtu\.be/", u, re.I) and "dumpert" not in (f.get("bron") or "").lower():
        return "journaal"
    return "short"

# AD heeft geen herkenbaar officieel YouTube-kanaal (zoekresultaten zijn andere 'AD'-kanalen).
VIDEO_RE = re.compile(r"v\.redd\.it|youtube\.com/watch|youtu\.be/|youtube\.com/shorts|streamable\.com|"
                      r"(?:twitter|x)\.com/[^/]+/status|tiktok\.com|instagram\.com/reel|nos\.nl/video|rtl\.nl/video", re.I)


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def kort_getal(n, eenheid):
    if n is None:
        return ""
    if n >= 1_000_000:
        s = f"{n/1_000_000:.1f}".replace(".", ",").replace(",0", "") + "M"
    elif n >= 1000:
        s = f"{n/1000:.1f}".replace(".", ",").replace(",0", "") + "k"
    else:
        s = str(n)
    return f"{s} {eenheid}"


def iso2dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def hhmm(dt):
    return dt.astimezone(TZ).strftime("%H:%M")


def strip(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()


# ---------------- Dumpert ----------------
DUMPERT_MIN = 8  # minder Dumpert-toppers vanaf 00:00? dan terugval naar de laatste 24 uur


def dumpert_embed(it):
    """Afspeelbare URL voor een Dumpert-item (zelfde regels als scripts/fix-dumpert.mjs op de site).
    Voorkeur: MP4 (1080p/720p/tablet/mobile) -> HLS ('stream', anders een andere .m3u8-variant)
    -> YouTube-embed voor items die op YouTube staan. Leeg = geen video (bv. foto-item)."""
    yt_re = re.compile(r"(?:youtube(?:-nocookie)?\.com/(?:embed/|shorts/|watch\?(?:.*&)?v=)|youtu\.be/)([\w-]{6,})")
    for md in it.get("media") or []:
        t = (md.get("mediatype") or "").upper()
        vs = [(v.get("version") or "", v.get("uri") or "") for v in md.get("variants") or []]
        for _, u in vs:
            m = yt_re.search(u)
            if m:
                return f"https://www.youtube-nocookie.com/embed/{m.group(1)}?autoplay=1&rel=0"
        if "YOUTUBE" in t:
            for ver, u in vs:
                if re.fullmatch(r"[\w-]{11}", u or ""):
                    return f"https://www.youtube-nocookie.com/embed/{u}?autoplay=1&rel=0"
        if t and t != "VIDEO":
            continue
        d = dict(vs)
        for ver in ("1080p", "720p", "tablet", "mobile", "original"):
            if re.search(r"\.mp4(\?|$)", d.get(ver, ""), re.I):
                return d[ver]
        for _, u in vs:
            if re.search(r"\.mp4(\?|$)", u, re.I):
                return u
        if re.search(r"\.m3u8(\?|$)", d.get("stream", ""), re.I):
            return d["stream"]
        for ver in ("720p", "tablet", "1080p", "mobile"):
            if re.search(r"\.m3u8(\?|$)", d.get(ver, ""), re.I):
                return d[ver]
    return ""


def dumpert(since):
    h = get("https://www.dumpert.nl/toppers")
    m = re.search(r'window\.__DUMPERT_CONTEXT__ = JSON\.parse\(\s*("(?:[^"\\]|\\.)*")\s*\)', h, re.S)
    ctx = json.loads(json.loads(m.group(1)))
    st = ctx["state"]
    key = next(k for k in st if "list=toppers" in k)
    out = []
    for it in st[key]["data"]["result"]["data"]["items"]:
        if it.get("nsfw") or it.get("partner_content") or it.get("secret"):
            continue
        s = it.get("stats") or {}
        if not s.get("views_today"):
            continue
        pub = iso2dt(it["published_at"])
        if pub < since:
            continue
        stream = dumpert_embed(it)
        if not stream:
            continue  # foto-items en items zonder video: geen filmpje
        out.append({
            "titel": it["title"].strip(),
            "ai": strip(it.get("description")),
            "bron": "Dumpert",
            "href": f"https://www.dumpert.nl/item/{it['id']}",
            "embed": stream,  # MP4 als die er is, anders de HLS-stream (.m3u8); of een YouTube-embed
            "thumb": (it.get("stills") or {}).get("still-medium") or it.get("still") or it.get("thumbnail") or "",
            "populariteit": f"{kort_getal(s.get('views_today'), 'views')} · {s.get('kudos_today', 0)} kudos",
            "tijd": hhmm(pub),
            "_tags": it.get("tags", ""),
            "_score": s.get("kudos_today", 0),
            "_gepubliceerd": pub.isoformat(),
        })
    out.sort(key=lambda x: -x["_score"])
    return out


# ---------------- YouTube nieuwskanalen ----------------
def yt_kanaal(naam, cid, since):
    t = get(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}")
    out = []
    for e in re.findall(r"<entry>.*?</entry>", t, re.S):
        pub = iso2dt(re.search(r"<published>(.*?)</published>", e).group(1))
        if pub < since:
            continue
        vid = re.search(r"<yt:videoId>(.*?)</yt:videoId>", e).group(1)
        views = re.search(r'views="(\d+)"', e)
        views = int(views.group(1)) if views else None
        desc = re.search(r"<media:description>(.*?)</media:description>", e, re.S)
        link = re.search(r'<link rel="alternate" href="([^"]+)"', e)
        out.append({
            "titel": html.unescape(re.search(r"<title>(.*?)</title>", e).group(1)).strip(),
            "ai": strip(desc.group(1))[:300] if desc else "",
            "bron": "YouTube",
            "href": link.group(1) if link else f"https://www.youtube.com/watch?v={vid}",
            "embed": f"https://www.youtube-nocookie.com/embed/{vid}?autoplay=1&rel=0",  # iframe-embed (niet afspeelbaar in een Canvas)
            "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "populariteit": kort_getal(views, "views") if views is not None else "",
            "tijd": hhmm(pub),
            "_kanaal": naam,
            "_score": views or 0,
            "_gepubliceerd": pub.isoformat(),
        })
    return out


# ---------------- Instagram ----------------
def _ig_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": IG_UA, "Accept": "text/html", "Accept-Language": "nl-NL,nl;q=0.9"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def instagram(naam, user, since, maxi=3):
    """Reels van vandaag uit Instagram's eigen profiel-embed; MP4 uit de post-embed (ondertekend, enkele dagen geldig)."""
    t = _ig_get(f"https://www.instagram.com/{user}/embed/")
    m = re.search(r'"contextJSON":"((?:[^"\\]|\\.)*)"', t)
    if not m:
        raise RuntimeError("geen Instagram-embeddata")
    ctx = json.loads(json.loads('"' + m.group(1) + '"')).get("context", {})
    out = []
    for g in ctx.get("graphql_media", []):
        s = g.get("shortcode_media") or {}
        pub = datetime.fromtimestamp(s.get("taken_at_timestamp", 0), timezone.utc)
        if not s.get("is_video") or pub < since or len(out) >= maxi:
            continue
        try:
            e = _ig_get(f"https://www.instagram.com/p/{s['shortcode']}/embed/captioned/")
        except Exception:
            continue
        mv = re.search(r'video_url(?:\\+)?":(?:\\+)?"(https:[^"]+?\.mp4[^"]*?)(?:\\+)?"', e)
        if not mv:
            continue
        mp4 = re.sub(r"\\+u0026", "&", re.sub(r"\\+/", "/", mv.group(1))).replace("\\", "")
        tekst = ((s.get("edge_media_to_caption") or {}).get("edges") or [{}])[0].get("node", {}).get("text", "").strip()
        tekst = re.sub(r"(\s*#[\w]+)+\s*$", "", tekst).strip()
        zin = re.match(r"^[\s\S]{15,140}?[.!?](\s|$)", tekst)
        titel = re.sub(r"\s+", " ", (zin.group(0) if zin else tekst.split("\n")[0])).strip() or f"Video van {naam}"
        if len(titel) > 110:
            titel = re.sub(r"\s+\S*$", "", titel[:107]) + "…"
        rest = re.sub(r"\s+", " ", tekst[len(titel):] if tekst.startswith(titel) else "").strip()
        likes = (s.get("edge_liked_by") or {}).get("count", 0)
        res = s.get("display_resources") or []
        out.append({
            "titel": titel, "ai": rest[:300], "bron": "Instagram",
            "href": f"https://www.instagram.com/reel/{s['shortcode']}/", "embed": mp4,
            "thumb": (res[0]["src"] if res else s.get("display_url", "")),
            "populariteit": kort_getal(likes, "likes") if likes else "", "tijd": hhmm(pub), "soort": "short",
            "_kanaal": f"Instagram {naam}", "_score": likes * 20, "_gepubliceerd": pub.isoformat(),
        })
    return out


# ---------------- ontdubbelen ----------------
_TRACK = re.compile(r"^(utm_\w+|si|igsh|igshid|feature|ref|ref_src|s|fbclid|gclid|mc_\w+|pp|ab_channel)$")


def canon_url(u):
    try:
        p = urllib.parse.urlsplit(u.strip())
    except Exception:
        return u or ""
    host = re.sub(r"^(www\.|m\.|mobile\.)", "", p.netloc.lower()).replace("twitter.com", "x.com")
    q = "&".join(f"{k}={v}" for k, v in urllib.parse.parse_qsl(p.query) if not _TRACK.match(k))
    return host + p.path.rstrip("/") + (("?" + q) if q else "")


def video_keys(v):
    ks = set()
    for u in filter(None, [v.get("href"), v.get("embed"), v.get("_video")]):
        m = re.search(r"(?:youtube(?:-nocookie)?\.com/(?:shorts/|embed/|watch\?(?:.*&)?v=|live/)|youtu\.be/)([\w-]{11})", u)
        if m: ks.add("yt:" + m.group(1))
        m = re.search(r"instagram\.com/(?:[\w.]+/)?(?:p|reel|reels|tv)/([\w-]+)", u)
        if m: ks.add("ig:" + m.group(1))
        m = re.search(r"(?:x|twitter)\.com/[^/]+/status/(\d+)", u)
        if m: ks.add("x:" + m.group(1))
        m = re.search(r"reddit\.com/r/\w+/comments/(\w+)", u)
        if m: ks.add("rd:" + m.group(1))
        m = re.search(r"v\.redd\.it/(\w+)", u)
        if m: ks.add("vr:" + m.group(1))
        m = re.search(r"dumpert\.nl/(?:item|mediabase|embed)/([\w_]+)", u)
        if m: ks.add("dp:" + m.group(1))
        if re.search(r"\.(mp4|m3u8)(\?|$)", u):
            ks.add("media:" + re.sub(r"\?.*$", "", re.sub(r"^https?://", "", u)))
        ks.add("url:" + canon_url(u))
    return ks


def titel_tokens(t):
    t = re.sub(r"\s[|\-–—]\s[^|\-–—]{2,30}$", "", t or "")
    t = re.sub(r"#\w+", " ", t.lower())
    return {w for w in re.findall(r"[a-z0-9à-ÿ]{2,}", t)}


def bijna_gelijk(a, b):
    if len(a) < 4 or len(b) < 4:
        return False
    return len(a & b) / len(a | b) >= 0.8


def ontdubbel(lijst, tegen=()):
    """Houdt het eerste (beste) exemplaar; andere bronnen komen in 'ook'. Wat al in 'tegen' (Dumpert) zit valt weg."""
    tegen_keys = set().union(*[video_keys(t) for t in tegen]) if tegen else set()
    tegen_tok = [titel_tokens(t.get("titel")) for t in tegen]
    out, keys, toks, weg = [], [], [], 0
    for v in lijst:
        k, tk = video_keys(v), titel_tokens(v.get("titel"))
        if k & tegen_keys or any(bijna_gelijk(tk, t) for t in tegen_tok):
            weg += 1; continue
        hit = next((i for i in range(len(out)) if k & keys[i] or bijna_gelijk(tk, toks[i])), None)
        if hit is None:
            out.append(v); keys.append(set(k)); toks.append(tk)
        else:
            weg += 1; keys[hit] |= k
            b = out[hit]
            if v.get("bron") != b.get("bron") and not any(o["bron"] == v.get("bron") for o in b.setdefault("ook", [])):
                b["ook"].append({"bron": v.get("bron"), "href": v.get("href")})
    return out, weg


def main():
    nu = datetime.now(timezone.utc)
    if "--uren" in sys.argv:
        uren = int(sys.argv[sys.argv.index("--uren") + 1])
        since = nu - timedelta(hours=uren)
        since_dump = since - timedelta(hours=24)
    else:  # standaard: alleen nieuws van vandaag, vanaf 00:00 Europe/Amsterdam
        since = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        since_dump = since  # Dumpert: vanaf 00:00 vandaag, met terugval naar 24 uur (zie onder)
    alleen_d = "--dumpert" in sys.argv
    alleen_f = "--filmpjes" in sys.argv
    status, filmpjes, dump = {}, [], []

    def run(naam, fn, *a):
        try:
            r = fn(*a)
            status[naam] = f"ok ({len(r)})"
            return r
        except Exception as ex:
            status[naam] = f"fout: {ex}"
            return []

    with ThreadPoolExecutor(12) as ex:
        fut_d = None if alleen_f else ex.submit(run, "Dumpert", dumpert, since_dump)
        fut_y = [] if alleen_d else [ex.submit(run, f"YouTube {n}", yt_kanaal, n, c, since) for n, c in YT_NIEUWS.items()]
        fut_i = [] if alleen_d else [ex.submit(run, f"Instagram {n}", instagram, n, u, since) for n, u in IG_ACCOUNTS.items()]
        if not alleen_d:  # politiek: max 2 per account
            fut_i += [ex.submit(run, f"Instagram politiek {n}", instagram, n, u, since, 2) for n, u in IG_POLITIEK.items()]
            fut_y += [ex.submit(run, f"YouTube politiek {n}", lambda n, c, s_: yt_kanaal(n, c, s_)[:2], n, c, since) for n, c in YT_POLITIEK.items()]
        for f in fut_y + fut_i:
            filmpjes += f.result()
        if fut_d:
            dump = fut_d.result()
            if "--uren" not in sys.argv and len(dump) < DUMPERT_MIN:
                dump = run("Dumpert (terugval 24 uur)", dumpert, nu - timedelta(hours=24))

    status["YouTube trending (Invidious)"] = "overgeslagen: alleen livestreams met 0 views, niet NL-specifiek"
    status["X"] = "via X-tools (search_posts_all, has:videos, nieuwsaccounts), niet in dit script"
    status["TikTok"] = "overgeslagen: geen snelle open route"
    # strenge ontdubbeling (zelfde regels als src/dedup.ts): zelfde id/link/stream of bijna-gelijke titel
    dump, _ = ontdubbel(dump)
    for f in filmpjes:
        f["soort"] = soort_van(f)
    ff, weg = ontdubbel(sorted(filmpjes, key=lambda x: -x["_score"]), dump)
    status["Ontdubbeld"] = f"{weg} dubbele filmpjes weggehaald"
    out = {"filmpjes": ff, "dumpert": dump, "status": status}
    if alleen_d:
        out = {"dumpert": dump, "status": status}
    if alleen_f:
        out = {"filmpjes": ff, "status": status}
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
