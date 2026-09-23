#!/usr/bin/env bash
# Regenerates the README screenshots in docs/screenshots from the running
# stack: demo files, then a Playwright pass in light and dark, then a lossy
# PNG squeeze (pngquant) so the README stays quick to load.
set -euo pipefail
cd "$(dirname "$0")/../.."
./e2e/screenshots/make-demo-media.sh >/dev/null
./e2e/run.sh -- --config screenshots.config.ts
# pngquant runs as root to install, then hands the files back to you.
docker run --rm -v "$PWD/docs/screenshots":/s alpine:3 sh -c \
  "apk add -q --no-cache pngquant >/dev/null && pngquant --force --skip-if-larger --quality 70-90 --ext .png /s/*.png; chown $(id -u):$(id -g) /s/*.png"
ls -la docs/screenshots | awk 'NR>3 {printf "%7.0f KB  %s\n", $5/1024, $9}'
