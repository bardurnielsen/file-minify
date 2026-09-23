#!/usr/bin/env bash
# Generates the test videos with the backend's own ffmpeg (so nothing large is
# committed) into e2e/.media. Needs the stack running. Existing files are kept.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p e2e/.media

gen() { # gen <name> <ffmpeg args...>
  local name="$1"; shift
  [ -s "e2e/.media/$name" ] && return 0
  docker compose exec -T backend ffmpeg -v error -y "$@" "/tmp/$name"
  docker compose cp "backend:/tmp/$name" "e2e/.media/$name" >/dev/null 2>&1
  docker compose exec -T backend rm -f "/tmp/$name"
}

# Moving pattern plus grain, so encoders have real work: a clean synthetic
# picture compresses unrealistically well.
# 720p, 6 s, ~3 MB: over the 2 MB the target-size control needs.
gen clip-720.mp4 -f lavfi -i testsrc2=s=1280x720:r=30:d=6 -f lavfi -i sine=d=6 \
  -vf noise=alls=6:allf=t -c:v libx264 -preset veryfast -b:v 4M -c:a aac -shortest
# 1080p, 8 s: slow enough at Best quality to watch the video queue.
gen clip-1080.mp4 -f lavfi -i testsrc2=s=1920x1080:r=30:d=8 -f lavfi -i sine=d=8 \
  -vf noise=alls=6:allf=t -c:v libx264 -preset veryfast -b:v 6M -c:a aac -shortest
