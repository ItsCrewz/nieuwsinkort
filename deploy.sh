#!/usr/bin/env bash
# Bouwt de site en zet hem op Cloudflare Pages (project "nieuwsinkort").
#
# Doel-branch komt uit het bestand DEPLOY_BRANCH (naast dit script):
#   main    -> de nieuwe build gaat live op productie (zoals vroeger).
#   anders  -> (bijv. "design") de nieuwe build gaat ALLEEN naar die preview-branch, en
#              productie (main) krijgt de bevroren oude site uit prod-frozen/ met de VERSE
#              data.json. Zo blijft het live nieuws actueel zonder het nieuwe design live te zetten.
#
# Omgeving:
#   CANVAS_SRC=<pad>   eerst public/data.json verversen uit de canvas-bron
#   SKIP_BUILD=1       niet bouwen (dist/ moet al bestaan)
#   DRY_RUN=1          alles voorbereiden en controleren, maar niets uploaden (toont de commando's)
#   FROZEN_BRANCH=x    (alleen om te testen) bevroren productie naar branch x i.p.v. main
#   DEPLOY_WORKER=1    ook de uur-Worker (worker/, cron 06:00-23:00) deployen
#   CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN (optioneel; inloggen kan via wrangler OAuth)
set -euo pipefail
cd "$(dirname "$0")"

export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-bd9e60b47f14fc182568ebe9cace7135}"
PROJECT="${CF_PAGES_PROJECT:-nieuwsinkort}"

# --- doel-branch: veilig standaard "design" als het bestand ontbreekt of leeg is
BRANCH="design"
if [ -f DEPLOY_BRANCH ]; then
  b="$(tr -d '[:space:]' < DEPLOY_BRANCH)"
  [ -n "$b" ] && BRANCH="$b"
fi
if ! [[ "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "deploy.sh: ongeldige branch in DEPLOY_BRANCH: '$BRANCH'" >&2
  exit 1
fi
FROZEN_BRANCH="${FROZEN_BRANCH:-main}"

run() {
  if [ -n "${DRY_RUN:-}" ]; then echo "[dry-run] $*"; else "$@"; fi
}
pages_deploy() { # <map> <branch>
  run npx wrangler pages deploy "$1" --project-name "$PROJECT" --branch "$2" --commit-dirty=true
}

if [ -n "${CANVAS_SRC:-}" ]; then
  node export_from_canvas.mjs "$CANVAS_SRC"   # draait zelf ook scripts/fix-dumpert.mjs
else
  # Dumpert-items zonder afspeelbare stream aanvullen of weglaten (ook zonder verse export)
  node scripts/fix-dumpert.mjs public/data.json || true
fi

[ -d node_modules ] || npm ci
if [ -z "${SKIP_BUILD:-}" ]; then
  # npm run build draait eerst scripts/build-bronnen.mjs: public/bronnen.json wordt
  # opnieuw opgebouwd uit ${FEEDS_JSON:-/workspace/nieuws/feeds.json} (+ filmpjes.py),
  # zodat het Bronnen-paneel gelijk loopt met de feeds.
  npm run build
fi
test -f dist/index.html && test -f dist/data.json && test -f dist/bronnen.json
node -e 'const d=require("./public/data.json"); if(!Array.isArray(d.items)||!d.items.length) {console.error("data.json zonder items"); process.exit(1)}'

# Project aanmaken als het nog niet bestaat (eenmalig; faalt stil als het al bestaat)
[ -n "${DRY_RUN:-}" ] || npx wrangler pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 || true

if [ -n "${DEPLOY_WORKER:-}" ]; then
  echo "== uur-Worker (nieuwsinkort-uur) deployen"
  ( cd worker && { [ -d node_modules ] || npm ci; } && run npx wrangler deploy )
fi

if [ "$BRANCH" = "main" ]; then
  echo "== DEPLOY_BRANCH=main: nieuwe build naar productie"
  pages_deploy dist main
  exit 0
fi

# --- 1) productie: bevroren oude site + verse data (de functions/ map gaat automatisch mee)
echo "== DEPLOY_BRANCH=$BRANCH: productie ($FROZEN_BRANCH) krijgt de bevroren site uit prod-frozen/ met verse data.json"
test -f prod-frozen/index.html || { echo "prod-frozen/index.html ontbreekt" >&2; exit 1; }
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/nieuwsinkort-prod.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cp -R prod-frozen/. "$STAGE/"
rm -f "$STAGE/README.md"
cp public/data.json "$STAGE/data.json"
# elk bundle-bestand waar index.html naar verwijst moet er zijn
for a in $(grep -oE '/assets/[A-Za-z0-9._-]+' "$STAGE/index.html" | sort -u); do
  test -f "$STAGE$a" || { echo "prod-frozen mist $a" >&2; exit 1; }
done
echo "   bundel: $(grep -oE 'index-[A-Za-z0-9_-]+\.js' "$STAGE/index.html" | head -1), data: $(node -e 'const d=require(process.argv[1]);console.log(d.datum+", "+d.items.length+" items, gegenereerd "+d.gegenereerd)' "$STAGE/data.json")"
pages_deploy "$STAGE" "$FROZEN_BRANCH"

# --- 2) nieuwe build alleen als preview
echo "== nieuwe build naar preview-branch $BRANCH (https://$BRANCH.$PROJECT.pages.dev)"
pages_deploy dist "$BRANCH"
