#!/usr/bin/env bash
# Bouwt de site en zet dist/ op Cloudflare Pages (project "nieuwsinkort").
# Nodig in de omgeving: CLOUDFLARE_API_TOKEN en CLOUDFLARE_ACCOUNT_ID.
# Optioneel: CANVAS_SRC=<pad naar canvas-bron> om eerst public/data.json te verversen.
#            SKIP_BUILD=1 om alleen te deployen.
set -euo pipefail
cd "$(dirname "$0")"

# Inloggen gaat via wrangler OAuth (~/.config/.wrangler); een API-token is optioneel.
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-bd9e60b47f14fc182568ebe9cace7135}"

PROJECT="${CF_PAGES_PROJECT:-nieuwsinkort}"

if [ -n "${CANVAS_SRC:-}" ]; then
  node export_from_canvas.mjs "$CANVAS_SRC"
fi

[ -d node_modules ] || npm ci
if [ -z "${SKIP_BUILD:-}" ]; then
  npm run build
fi
test -f dist/index.html && test -f dist/data.json

# Project aanmaken als het nog niet bestaat (eenmalig; faalt stil als het al bestaat)
npx wrangler pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 || true

npx wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
