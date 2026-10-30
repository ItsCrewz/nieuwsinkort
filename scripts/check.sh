#!/usr/bin/env bash
set -e

stap() {
  local naam="$1"
  shift
  printf "\n==> %s\n" "$naam"
  if "$@"; then
    return 0
  else
    local code=$?
    printf "\nStap mislukt: %s (exitcode %s)\n" "$naam" "$code" >&2
    exit "$code"
  fi
}

stap "Tests" npm test
stap "Build" npm run build
stap "Performancebudget" node scripts/performance-budget.mjs
if [ ! -d worker/node_modules ]; then
  stap "Worker-afhankelijkheden installeren" npm --prefix worker ci
fi
stap "Worker-typecheck" npm --prefix worker exec -- tsc --noEmit
stap "Functions-typecheck" npx tsc -p functions/tsconfig.json --noEmit
printf "\nAlle controles geslaagd.\n"
