#!/usr/bin/env python3
"""stdin: JSON-lijst met foto-URL's -> stdout: {url: {"h": "<64-bit dHash hex>", "w": breedte, "hgt": hoogte} | null}.
null = niet te laden (kapot/geblokkeerd/geen plaatje). Gebruikt door scripts/add-beelden.mts."""
import sys, json, io, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
UA = "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)"
def one(u):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "image/*"}), timeout=10)
        b = r.read(4_000_000)
        im = Image.open(io.BytesIO(b)); w, h = im.size
        g = im.convert("L").resize((9, 8), Image.LANCZOS); p = list(g.get_flattened_data() if hasattr(g, "get_flattened_data") else g.getdata())
        bits = 0
        for y in range(8):
            for x in range(8):
                bits = (bits << 1) | (p[y * 9 + x] > p[y * 9 + x + 1])
        return u, {"h": f"{bits:016x}", "w": w, "hgt": h}
    except Exception:
        return u, None
urls = json.load(sys.stdin)
with ThreadPoolExecutor(8) as ex:
    print(json.dumps(dict(ex.map(one, urls))))
