#!/usr/bin/env bash
# Browser tests (Playwright) against the running stack.
#   ./e2e/run.sh                          # http://localhost:3051
#   ./e2e/run.sh http://mediasrv:3051     # somewhere else (media is still made locally)
#   ./e2e/run.sh -- --grep merge          # pass arguments to playwright test
# Runs in Microsoft's Playwright image - nothing is installed on the host. The
# image tag follows the @playwright/test version in package.json, so a bump
# there can't leave the browsers and the test runner out of step.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE_URL="http://localhost:3051"
if [ $# -gt 0 ] && [ "$1" != "--" ]; then BASE_URL="$1"; shift; fi
[ "${1:-}" = "--" ] && shift
export BASE_URL

./e2e/make-media.sh

PW=$(sed -n 's/.*"@playwright\/test": "\([0-9.]*\)".*/\1/p' e2e/package.json)
[ -n "$PW" ] || { echo "No exact @playwright/test version in e2e/package.json"; exit 1; }

docker run --rm --network host --ipc=host \
  -u "$(id -u):$(id -g)" -e HOME=/tmp -e BASE_URL -e CI \
  -v "$PWD":/repo -w /repo/e2e \
  "mcr.microsoft.com/playwright:v${PW}-noble" \
  sh -c 'npm ci --no-audit --no-fund --loglevel=error && npx playwright test "$@"' sh "$@"
