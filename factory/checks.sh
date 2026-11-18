#!/usr/bin/env bash
# The repo's checks. Exit 0 only when the branch is fit to review.
#
# The gate runs this script from the main checkout with the job's worktree as
# the working directory. Keep it fast, deterministic and non-interactive: no
# watch modes, no prompts, nothing that rewrites files.
#
# Runs every layer `npm run check` runs (see AGENTS.md): lint (ESLint + design
# tokens), format check, typecheck, unit, integration, production build,
# end-to-end (Playwright, headless Chromium, axe) and performance budgets
# (gzip size + LCP/CLS). Takes well under a minute once dependencies are cached.
set -euo pipefail

# Fresh worktrees have no node_modules.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  npm ci --prefer-offline --no-audit --no-fund
fi

# Headless Chromium for Playwright: a no-op when it's already in the shared cache.
npm run --silent setup:browsers >/dev/null

# Several jobs can run their gates at once: give this run its own free ports
# instead of the fixed defaults (4173 / 4174) the Playwright configs fall back to.
free_port() {
  node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
}
E2E_PORT="$(free_port)"
PERF_PORT="$(free_port)"
while [ "$PERF_PORT" = "$E2E_PORT" ]; do PERF_PORT="$(free_port)"; done
export E2E_PORT PERF_PORT CI=true

npm run check
