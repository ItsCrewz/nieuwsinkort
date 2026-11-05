"""Ontdubbeling voor de filmpjespipeline."""
import re, sys, urllib.parse

# Dezelfde uitgangspunten als src/dedup.ts.
# ---------------- ontdubbelen ----------------
_TRACK = re.compile(r"^(utm_\w+|si|igsh|igshid|feature|ref|ref_src|s|fbclid|gclid|mc_\w+|pp|ab_channel)$")


def canon_url(u):
    try:
        p = urllib.parse.urlsplit(u.strip())
    except Exception as ex:
        print(f"Ontdubbelen (URL): {type(ex).__name__}", file=sys.stderr)
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


