#!/usr/bin/env python3
"""Gebruik: yt_transcript.py <video_id> [...]  -> schone NL-transcriptie via Invidious (met fallbacks)."""
import sys, re, json, urllib.request, urllib.parse
UA={'User-Agent':'Mozilla/5.0'}
def get(url,t=30):
    return urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=t).read().decode('utf-8','ignore')
def instances():
    hs=['yt.chocolatemoo53.com','inv.nadeko.net','invidious.nerdvpn.de']
    try:
        for name,i in json.loads(get('https://api.invidious.io/instances.json?sort_by=health',15)):
            if i.get('type')=='https' and name not in hs: hs.append(name)
    except Exception: pass
    return hs
def clean(vtt):
    out=[]
    for l in vtt.splitlines():
        if not l.strip() or '-->' in l or l.startswith(('WEBVTT','Kind:','Language:')): continue
        l=re.sub(r'<[^>]+>','',l).strip()
        if l and (not out or out[-1]!=l): out.append(l)
    return ' '.join(out)
def transcript(vid):
    for h in instances():
        try:
            caps=json.loads(get(f'https://{h}/api/v1/captions/{vid}'))['captions']
            caps=sorted(caps,key=lambda c:(c['languageCode']!='nl','auto' in c['label']))
            if not caps: continue
            txt=clean(get(f'https://{h}'+caps[0]['url']))
            if len(txt)>50: return h,caps[0]['label'],txt
        except Exception: continue
    return None,None,''
for v in sys.argv[1:]:
    h,l,t=transcript(v)
    print(f'### {v} ({h}, {l})\n{t or "GEEN TRANSCRIPTIE"}\n')
