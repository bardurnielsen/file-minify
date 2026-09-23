#!/usr/bin/env bash
# Video encode benchmark: how long each quality tier and codec takes on THIS
# host, through the real API. Use it to pick MAX_FILE_MB and
# PROCESS_TIMEOUT_MIN for a server (see .env.example).
#
#   ./backend/test/bench.sh                    # generate a 30 s phone-like clip
#   BENCH_SECONDS=120 ./backend/test/bench.sh  # a longer one
#   ./backend/test/bench.sh my-video.mp4       # use a real clip instead
#   API=http://localhost:4001 ./backend/test/bench.sh
#
# Needs the stack running (docker compose up -d) and is run from the repo, like
# smoke.sh. Encodes run one after another, as the app runs them. A run that
# exceeds the backend's per-command timeout shows as FAILED: that is the
# signal to raise PROCESS_TIMEOUT_MIN.
set -u
API="${API:-http://localhost:4001}"
SECONDS_LONG="${BENCH_SECONDS:-30}"
cd "$(dirname "$0")/../.."
OUT=$(mktemp -d)

curl -fsS "$API/health" >/dev/null || { echo "Backend not reachable at $API - is the stack up?"; exit 1; }

# --- the clip ---------------------------------------------------------------
# The clip goes straight into the backend's temp directory rather than through
# POST /upload: this measures encoding, and is meant to help choose the upload
# limit, so it must not be bound by it. The encodes themselves go through the
# API exactly as the app sends them.
TAG="bench-$(date +%s)$$"
if [ $# -ge 1 ]; then
  SRC="$1"
  [ -f "$SRC" ] || { echo "No such file: $SRC"; exit 1; }
  EXT=$(printf '%s' "${SRC##*.}" | tr 'A-Z' 'a-z')
  case "$EXT" in mp4|mov|webm|avi) ;; *) echo "Needs an mp4, mov, webm or avi file"; exit 1 ;; esac
  NAME=$(basename "$SRC")
  ID="${TAG}.${EXT}"
  docker compose cp "$SRC" "backend:/app/temp/${ID}" >/dev/null 2>&1 \
    || { echo "Could not copy $SRC into the backend"; exit 1; }
else
  # Roughly what a Pixel records: 1080p30 HEVC at ~20 Mbps with AAC audio.
  # Moving test pattern plus temporal grain, so the encoder has real work;
  # a clean synthetic picture would compress unrealistically well.
  NAME="generated ${SECONDS_LONG} s clip"
  ID="${TAG}.mp4"
  echo "Generating a ${SECONDS_LONG} s 1080p HEVC clip at ~20 Mbps (this takes a moment)..."
  docker compose exec -T backend sh -c "ffmpeg -v error -y \
    -f lavfi -i testsrc2=s=1920x1080:r=30:d=${SECONDS_LONG} \
    -f lavfi -i sine=f=440:d=${SECONDS_LONG} \
    -vf noise=alls=6:allf=t -c:v libx265 -preset ultrafast -b:v 20M \
    -x265-params log-level=error -tag:v hvc1 -c:a aac -b:a 128k -shortest /app/temp/${ID}" \
    || { echo "Could not generate the clip"; exit 1; }
fi
cleanup() {
  docker compose exec -T backend sh -c "rm -f /app/temp/${ID} /app/temp/compressed-${TAG}.*" >/dev/null 2>&1
  rm -rf "$OUT"
}
trap cleanup EXIT
SIZE=$(docker compose exec -T backend stat -c%s "/app/temp/${ID}" | tr -d '\r')

probe() { # probe <temp id> <entries>
  docker compose exec -T backend ffprobe -v error -select_streams v:0 \
    -show_entries "$2" -of csv=p=0:s=x "/app/temp/$1" 2>/dev/null | head -1 | tr -d '\r' \
    | sed 's/x/ /'   # "hevcx1920x1080" -> "hevc 1920x1080"
}
DUR=$(docker compose exec -T backend ffprobe -v error -show_entries format=duration \
  -of csv=p=0 "/app/temp/$ID" | tr -d '\r')
SRCINFO=$(probe "$ID" stream=codec_name,width,height)

# --- the host ---------------------------------------------------------------
mb() { awk -v b="$1" 'BEGIN { printf "%.1f MB", b / 1048576 }'; }
echo
echo "Host:      $(nproc) threads, $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')"
echo "Load:      $(cut -d' ' -f1-3 /proc/loadavg) (1/5/15 min) - other work running now slows every result"
echo "Backend:   cpu.weight $(docker compose exec -T backend cat /sys/fs/cgroup/cpu.weight 2>/dev/null | tr -d '\r' || echo '?'), limits $(curl -s "$API/config")"
echo "Clip:      ${NAME}  $(mb "$SIZE"), ${DUR%.*} s, ${SRCINFO}"
echo

# --- the runs ---------------------------------------------------------------
TARGET=$(( SIZE / 1048576 / 8 )); [ "$TARGET" -lt 2 ] && TARGET=2
printf '%-28s %9s %9s %11s %-18s %s\n' "Setting" "Time" "Speed" "Output" "Result" "Status"
printf '%-28s %9s %9s %11s %-18s %s\n' "-------" "----" "-----" "------" "------" "------"
run() { # run <label> <json body>
  local label="$1" body="$2" r t code outid size info speed
  r=$(curl -s -o "$OUT/r.json" -w '%{http_code} %{time_total}' -X POST "$API/compression/$ID" \
      -H 'Content-Type: application/json' -d "$body")
  code=${r%% *}; t=${r##* }
  if [ "$code" != "200" ]; then
    printf '%-28s %8.0fs %9s %11s %-18s %s\n' "$label" "$t" "-" "-" "-" "FAILED (HTTP $code)"
    return
  fi
  outid=$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$OUT/r.json")
  size=$(sed -n 's/.*"compressedSize":\([0-9]*\).*/\1/p' "$OUT/r.json")
  info=$(probe "$outid" stream=codec_name,width,height)
  # The backend hands back the source itself when re-encoding wouldn't shrink it.
  [ "$outid" = "$ID" ] && info="kept original"
  speed=$(awk -v d="$DUR" -v t="$t" 'BEGIN { printf "%.1fx", d / t }')
  printf '%-28s %8.0fs %9s %11s %-18s %s\n' "$label" "$t" "$speed" "$(mb "$size")" "$info" "ok"
}
run "Smaller    H.264"          '{"quality":"low","format":"original"}'
run "Smaller    H.265"          '{"quality":"low","format":"original","codec":"h265"}'
run "Balanced   H.264"          '{"quality":"medium","format":"original"}'
run "Balanced   H.265"          '{"quality":"medium","format":"original","codec":"h265"}'
run "Best       H.264"          '{"quality":"high","format":"original"}'
run "Best       H.265"          '{"quality":"high","format":"original","codec":"h265"}'
run "Target ${TARGET} MB H.264"   "{\"format\":\"original\",\"maxSize\":${TARGET}}"
run "Target ${TARGET} MB H.265"   "{\"format\":\"original\",\"maxSize\":${TARGET},\"codec\":\"h265\"}"

echo
echo "Speed is clip length / encode time: 2.0x means a minute of video takes 30 s."
echo "A job's slowest command must finish within PROCESS_TIMEOUT_MIN; a target-size"
echo "run is two commands, each roughly half its time. The clip and its results"
echo "are deleted when the run ends."
