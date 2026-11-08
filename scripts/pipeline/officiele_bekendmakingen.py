#!/usr/bin/env python3
"""Haal recente officiële bekendmakingen op via repository.overheid.nl SRU.

Filter standaard op nieuwswaardige types (raadsbesluit, verordening,
verkeersbesluit, omgevingsplan) en skip routine omgevingsvergunningen tenzij
--all. Gebruik: python3 officiele_bekendmakingen.py [--gemeente Haarlem] [--max 10] [--all]
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.parse
import urllib.request
from xml.etree import ElementTree as ET

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
NS = {
    "sru": "http://docs.oasis-open.org/ns/search-ws/sruResponse",
    "gzd": "http://standaarden.overheid.nl/sru",
    "dcterms": "http://purl.org/dc/terms/",
    "overheid": "http://standaarden.overheid.nl/owms/terms/",
    "ow": "http://standaarden.overheid.nl/wetgeving/",
}

DEFAULT_GEMEENTEN = [
    "Haarlem",
    "Heemstede",
    "Bloemendaal",
    "Zandvoort",
    "Velsen",
    "Haarlemmermeer",
]

# Titels/types die meestal nieuwswaardig zijn (case-insensitive substring)
NIEUWS_HINTS = (
    "raadsbesluit",
    "collegebesluit",
    "verordening",
    "verkeersbesluit",
    "omgevingsplan",
    "bestemmingsplan",
    "apv",
    "referendum",
    "huisvestingsverordening",
    "parkeer",
    "evenement",
    "sluiting",
    "aanwijzing",
    "exploitatie",
)


def sru_url(gemeente: str, maximum: int) -> str:
    q = (
        f'c.product-area==officielepublicaties AND dt.creator="{gemeente}" '
        f"sortBy dt.modified /sort.descending"
    )
    return (
        "https://repository.overheid.nl/sru?query="
        + urllib.parse.quote(q)
        + f"&maximumRecords={maximum}"
    )


def text(el, path: str) -> str:
    if el is None:
        return ""
    found = el.find(path, NS)
    return (found.text or "").strip() if found is not None else ""


def fetch(gemeente: str, maximum: int) -> list[dict]:
    url = sru_url(gemeente, maximum)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/xml"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    root = ET.fromstring(raw)
    items = []
    for rec in root.findall(".//sru:record", NS):
        gzd = rec.find(".//gzd:gzd", NS)
        if gzd is None:
            gzd = rec
        title = text(gzd, ".//dcterms:title") or text(gzd, ".//ow:titel")
        modified = text(gzd, ".//dcterms:modified")
        identifier = text(gzd, ".//dcterms:identifier")
        types = [t.text.strip() for t in gzd.findall(".//dcterms:type", NS) if t.text]
        # preferred public URL
        href = ""
        for loc in list(gzd.findall(".//gzd:preferredUrl", NS)) + list(gzd.findall(".//{*}preferredUrl")):
            if loc.text:
                href = loc.text.strip()
                break
        if not href:
            for loc in gzd.findall(".//{*}locationUrl", NS):
                if loc is not None and (loc.text or "").startswith("http"):
                    href = loc.text.strip()
                    break
        if not href and identifier:
            href = identifier
        items.append(
            {
                "gemeente": gemeente,
                "titel": title,
                "modified": modified,
                "types": types,
                "href": href,
            }
        )
    return items


def is_nieuwswaardig(item: dict) -> bool:
    blob = " ".join([item.get("titel", ""), " ".join(item.get("types") or [])]).lower()
    if any(h in blob for h in NIEUWS_HINTS):
        return True
    # skip pure routine omgevingsvergunning aanvraag/verleend unless hinted above
    if re.search(r"omgevingsvergunning|aanvraag omgevings", blob):
        return False
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gemeente", action="append", dest="gemeenten")
    ap.add_argument("--max", type=int, default=8, help="records per gemeente")
    ap.add_argument("--all", action="store_true", help="geen nieuwswaardig-filter")
    args = ap.parse_args()
    gemeenten = args.gemeenten or DEFAULT_GEMEENTEN
    out = []
    for g in gemeenten:
        try:
            rows = fetch(g, args.max)
        except Exception as e:
            print(f"# fout {g}: {e}", file=sys.stderr)
            continue
        for r in rows:
            if args.all or is_nieuwswaardig(r):
                out.append(r)
    for r in out:
        types = ",".join(r["types"])
        print(f"{r['modified']}\t{r['gemeente']}\t{r['titel']}\t{types}\t{r['href']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
