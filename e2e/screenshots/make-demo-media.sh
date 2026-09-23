#!/usr/bin/env bash
# Demo files for the README screenshots, made with the backend's tools into
# e2e/.media/demo. Separate from make-media.sh so the test runs don't pay for
# them. Needs the stack running; existing files are kept.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=e2e/.media/demo
mkdir -p "$OUT"

make() { # make <name> <shell command writing /tmp/<name> inside the backend>
  local name="$1" cmd="$2"
  [ -s "$OUT/$name" ] && return 0
  docker compose exec -T backend sh -c "$cmd"
  docker compose cp "backend:/tmp/$name" "$OUT/$name" >/dev/null 2>&1
  docker compose exec -T backend rm -f "/tmp/$name"
}

# A large, photo-like JPEG (soft colour field plus grain), about what a phone
# camera writes.
make harbour-at-dusk.jpg \
  'convert -size 4000x3000 plasma:steelblue-darkorange -blur 0x3 -attenuate 0.4 +noise Gaussian -quality 95 /tmp/harbour-at-dusk.jpg'
# 20 s of 1080p at a phone's bitrate.
make site-inspection.mp4 \
  'ffmpeg -v error -y -f lavfi -i testsrc2=s=1920x1080:r=30:d=20 -f lavfi -i sine=d=20 -vf noise=alls=8:allf=t -c:v libx264 -preset veryfast -b:v 16M -c:a aac -shortest /tmp/site-inspection.mp4'
# A scan-style PDF: one big image per page.
make inspection-report.pdf \
  'convert -size 2480x3508 plasma:white-lightgrey -blur 0x1 -quality 95 /tmp/p.jpg && convert /tmp/p.jpg /tmp/p.jpg /tmp/inspection-report.pdf && rm -f /tmp/p.jpg'
# A real Word document with a photo in it, written by LibreOffice from HTML:
# a text-only file is so small that turning it into a PDF makes it bigger.
if [ ! -s "$OUT/Quarterly update.docx" ]; then
  docker compose exec -T backend sh -s <<'SH'
set -e
rm -rf /tmp/qdoc && mkdir /tmp/qdoc && cd /tmp/qdoc
convert -size 2400x1600 plasma:seagreen-khaki -blur 0x2 -quality 95 site.jpg
{
  echo '<html><body><h1>Quarterly update</h1>'
  echo '<p>Progress on the harbour works this quarter, with photos from the site visit.</p>'
  echo '<h2>Site</h2><p><img width="600" src="data:image/jpeg;base64,'"$(base64 -w0 site.jpg)"'"></p>'
  echo '<p>Foundations are complete on the east side; the west side follows next quarter.</p>'
  echo '</body></html>'
} > "Quarterly update.html"
HOME=/tmp soffice --headless --convert-to docx:"MS Word 2007 XML" --outdir /tmp/qdoc "Quarterly update.html" >/dev/null 2>&1
SH
  docker compose cp "backend:/tmp/qdoc/Quarterly update.docx" "$OUT/Quarterly update.docx" >/dev/null 2>&1
  docker compose exec -T backend rm -rf /tmp/qdoc
fi
ls -la "$OUT" | awk 'NR>3 {printf "%8.1f MB  %s %s\n", $5/1048576, $9, $10}'
