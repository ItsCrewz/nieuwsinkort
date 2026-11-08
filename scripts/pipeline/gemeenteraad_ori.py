#!/usr/bin/env python3
"""Recente gemeenteraad/college-vergaderingen via Open Raadsinformatie Elastic.

Notubiz (api.notubiz.nl / gemeentebestuur-haarlem.notubiz.nl) is vanaf de box
vaak onbereikbaar (timeout/403). ORI spiegelde Notubiz-data van Haarlem e.o.

Gebruik: python3 gemeenteraad_ori.py [--gemeente haarlem] [--max 10] [--type Meeting]
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Stabiele alias-achtige indexnamen bestaan niet; we zoeken via _cat en pakken de nieuwste.
GEMEENTE_HINTS = {
    "haarlem": "ori_haarlem_",
    "heemstede": "ori_heemstede_",
    "bloemendaal": "ori_bloemendaal_",
    "zandvoort": "ori_zandvoort_",
    "velsen": "ori_velsen_",
    "haarlemmermeer": "ori_haarlemmermeer_",
}

NOTUBIZ_PUBLIC = {
    "haarlem": "https://gemeentebestuur-haarlem.notubiz.nl/",
}


def http_json(url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode())


def resolve_index(gemeente: str) -> str:
    hint = GEMEENTE_HINTS.get(gemeente.lower())
    if not hint:
        raise SystemExit(f"onbekende gemeente: {gemeente}")
    # _cat returns JSON list when format requested via Accept — use plain text
    url = f"https://api.openraadsinformatie.nl/v1/elastic/_cat/indices/{hint}*?h=index"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        lines = [ln.strip() for ln in resp.read().decode().splitlines() if ln.strip()]
    if not lines:
        raise SystemExit(f"geen ORI-index voor {gemeente}")
    # newest by name suffix date
    return sorted(lines)[-1]


def recent(index: str, doc_type: str, size: int) -> list[dict]:
    body = {
        "size": size,
        "sort": [{"start_date": {"order": "desc", "unmapped_type": "date"}}],
        "query": {"term": {"@type": doc_type}},
        "_source": [
            "name",
            "@type",
            "start_date",
            "end_date",
            "last_discussed_at",
            "classification",
            "location",
            "status",
            "@id",
        ],
    }
    url = f"https://api.openraadsinformatie.nl/v1/elastic/{index}/_search"
    data = http_json(url, body)
    out = []
    for hit in data.get("hits", {}).get("hits", []):
        s = hit.get("_source") or {}
        oid = s.get("@id") or hit.get("_id")
        out.append(
            {
                "id": oid,
                "naam": s.get("name"),
                "type": s.get("@type"),
                "start": s.get("start_date"),
                "status": s.get("status"),
                "classification": s.get("classification"),
                "ori_resolve": f"https://api.openraadsinformatie.nl/v1/resolve/{oid}"
                if oid
                else "",
            }
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gemeente", default="haarlem")
    ap.add_argument("--max", type=int, default=10)
    ap.add_argument("--type", default="Meeting", choices=["Meeting", "AgendaItem", "MediaObject"])
    args = ap.parse_args()
    try:
        index = resolve_index(args.gemeente)
    except Exception as e:
        print(f"# fout index: {e}", file=sys.stderr)
        return 1
    print(f"# index={index} notubiz={NOTUBIZ_PUBLIC.get(args.gemeente.lower(), '')}", file=sys.stderr)
    try:
        rows = recent(index, args.type, args.max)
    except Exception as e:
        print(f"# fout search: {e}", file=sys.stderr)
        return 1
    for r in rows:
        print(f"{r['start']}\t{r['naam']}\t{r['type']}\t{r['ori_resolve']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
