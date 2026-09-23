#!/usr/bin/env bash
# API smoke suite. Needs the stack running: docker compose up -d --build
#   ./backend/test/smoke.sh                       # default port
#   ./backend/test/smoke.sh http://localhost:4000 # somewhere else
set -u
API="${1:-http://localhost:4001}"
cd "$(dirname "$0")"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
pass=0; fail=0

up() { # upload <file> <mime> -> prints id
  curl -s -X POST "$API/upload" -F "files=@$1;type=$2" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p'
}

check() { # check <label> <json> <downloadbase>
  local label="$1" json="$2" base="$3"
  local outid; outid=$(printf '%s' "$json" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  if [ -z "$outid" ]; then
    echo "FAIL  $label -> $(printf '%s' "$json" | head -c 160)"; fail=$((fail+1)); return
  fi
  local code sz
  code=$(curl -s -o "$OUT/out_$outid" -w '%{http_code}' "$API/$base/download/$outid")
  sz=$(stat -c%s "$OUT/out_$outid" 2>/dev/null || echo 0)
  local kind; kind=$(file -b --mime-type "$OUT/out_$outid" 2>/dev/null)
  if [ "$code" = "200" ] && [ "$sz" -gt 0 ]; then
    echo "PASS  $label -> $outid  ${sz}B  [$kind]  $(printf '%s' "$json" | grep -o '"\(compressionRatio\|newFormat\)":"[^"]*"' | tr '\n' ' ')"
    pass=$((pass+1))
  else
    echo "FAIL  $label -> download HTTP $code size $sz"; fail=$((fail+1))
  fi
}

echo "=== UPLOAD ==="
for spec in "fx.png:image/png" "fx.jpg:image/jpeg" "fx.pdf:application/pdf" "fx.mp4:video/mp4" "fx.docx:application/vnd.openxmlformats-officedocument.wordprocessingml.document"; do
  f=${spec%%:*}; m=${spec#*:}
  id=$(up "$f" "$m")
  if [ -n "$id" ]; then echo "PASS  upload $f -> $id"; pass=$((pass+1)); else echo "FAIL  upload $f"; fail=$((fail+1)); fi
  eval "ID_${f%%.*}_${f##*.}=$id"
done

echo; echo "=== COMPRESSION ==="
check "compress png (q70)"  "$(curl -s -X POST "$API/compression/$ID_fx_png" -H 'Content-Type: application/json' -d '{"quality":70,"format":"png"}')" compression
check "compress jpg (q60)"  "$(curl -s -X POST "$API/compression/$ID_fx_jpg" -H 'Content-Type: application/json' -d '{"quality":60,"format":"jpeg"}')" compression
r=$(curl -s -X POST "$API/compression/$ID_fx_png" -H 'Content-Type: application/json' -d '{"quality":60}')
case "$r" in
  *'"id":"compressed-'*'.png"'*) echo "PASS  png with no format stays png"; pass=$((pass+1)) ;;
  *) echo "FAIL  png with no format -> $(printf '%s' "$r" | head -c 160)"; fail=$((fail+1)) ;;
esac
check "compress pdf (med)"  "$(curl -s -X POST "$API/compression/$ID_fx_pdf" -H 'Content-Type: application/json' -d '{"quality":"medium"}')" compression
check "compress mp4 (med)"  "$(curl -s -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d '{"quality":"medium","format":"mp4"}')" compression
check "compress mp4 (low)"  "$(curl -s -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d '{"quality":"low","format":"original"}')" compression
check "compress mp4 (h265)" "$(curl -s -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d '{"quality":"low","format":"original","codec":"h265"}')" compression
check "compress mp4 (720p)" "$(curl -s -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d '{"quality":"high","format":"original","resolution":"720"}')" compression
check "compress mp4 (h265 2-pass)" "$(curl -s -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d '{"format":"original","maxSize":1,"codec":"h265"}')" compression

echo; echo "=== CONVERSION ==="
check "jpg -> webp"   "$(curl -s -X POST "$API/conversion/$ID_fx_jpg"  -H 'Content-Type: application/json' -d '{"format":"webp"}')" conversion
check "png -> pdf"    "$(curl -s -X POST "$API/conversion/$ID_fx_png"  -H 'Content-Type: application/json' -d '{"format":"pdf"}')"  conversion
check "pdf -> png"    "$(curl -s -X POST "$API/conversion/$ID_fx_pdf"  -H 'Content-Type: application/json' -d '{"format":"png"}')"  conversion
check "docx -> pdf"   "$(curl -s -X POST "$API/conversion/$ID_fx_docx" -H 'Content-Type: application/json' -d '{"format":"pdf"}')"  conversion
check "docx -> pdf (low)" "$(curl -s -X POST "$API/conversion/$ID_fx_docx" -H 'Content-Type: application/json' -d '{"format":"pdf","quality":"low"}')" conversion
check "mp4 -> webm"   "$(curl -s -X POST "$API/conversion/$ID_fx_mp4"  -H 'Content-Type: application/json' -d '{"format":"webm"}')" conversion
check "mp4 -> avi"    "$(curl -s -X POST "$API/conversion/$ID_fx_mp4"  -H 'Content-Type: application/json' -d '{"format":"avi"}')"  conversion

echo; echo "=== ERROR HANDLING ==="
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/compression/nope.pdf" -H 'Content-Type: application/json' -d '{}')
[ "$c" = "404" ] && { echo "PASS  missing file -> 404"; pass=$((pass+1)); } || { echo "FAIL  missing file -> $c"; fail=$((fail+1)); }
c=$(curl -s -X POST "$API/conversion/$ID_fx_docx" -H 'Content-Type: application/json' -d '{"format":"png"}' -o /dev/null -w '%{http_code}')
[ "$c" = "400" ] && { echo "PASS  docx->png rejected 400"; pass=$((pass+1)); } || { echo "FAIL  docx->png -> $c"; fail=$((fail+1)); }
# Ghostscript exits 0 on a PDF that needs a password and writes a blank page,
# which used to come back as a 95% saving. It must be refused instead.
ID_locked=$(up fx-locked.pdf application/pdf)
for spec in "compression:{\"quality\":\"medium\"}" "conversion:{\"format\":\"png\"}"; do
  route=${spec%%:*}; body=${spec#*:}
  r=$(curl -s -X POST "$API/$route/$ID_locked" -H 'Content-Type: application/json' -d "$body" -w ' %{http_code}')
  case "$r" in
    *password-protected*422) echo "PASS  locked pdf $route -> 422"; pass=$((pass+1)) ;;
    *) echo "FAIL  locked pdf $route -> $(printf '%s' "$r" | head -c 160)"; fail=$((fail+1)) ;;
  esac
done

echo; echo "=== MERGE ==="
r=$(curl -s -X POST "$API/merge" -H 'Content-Type: application/json' -d "{\"ids\":[\"$ID_fx_png\",\"$ID_fx_pdf\",\"$ID_fx_docx\"]}")
check "merge png+pdf+docx" "$r" merge
pages=$(printf '%s' "$r" | sed -n 's/.*"pageCount":\([0-9]*\).*/\1/p')
[ "${pages:-0}" -ge 3 ] && { echo "PASS  merge page count -> $pages"; pass=$((pass+1)); } || { echo "FAIL  merge page count -> ${pages:-none}"; fail=$((fail+1)); }
r=$(curl -s -X POST "$API/merge" -H 'Content-Type: application/json' -d "{\"ids\":[\"$ID_fx_png\",\"$ID_fx_mp4\"]}" -w ' %{http_code}')
case "$r" in
  *"\"failedId\":\"$ID_fx_mp4\""*400) echo "PASS  merge names unmergeable file -> 400"; pass=$((pass+1)) ;;
  *) echo "FAIL  merge with video -> $(printf '%s' "$r" | head -c 160)"; fail=$((fail+1)) ;;
esac
r=$(curl -s -X POST "$API/merge" -H 'Content-Type: application/json' -d "{\"ids\":[\"$ID_fx_pdf\",\"$ID_locked\"]}" -w ' %{http_code}')
case "$r" in
  *"\"failedId\":\"$ID_locked\""*422) echo "PASS  merge names locked pdf -> 422"; pass=$((pass+1)) ;;
  *) echo "FAIL  merge with locked pdf -> $(printf '%s' "$r" | head -c 160)"; fail=$((fail+1)) ;;
esac
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/merge" -H 'Content-Type: application/json' -d "{\"ids\":[\"$ID_fx_png\"]}")
[ "$c" = "400" ] && { echo "PASS  merge of one file -> 400"; pass=$((pass+1)); } || { echo "FAIL  merge of one file -> $c"; fail=$((fail+1)); }

echo; echo "=== SECURITY REGRESSIONS ==="
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d '{"format":"mp4$(touch /app/PWNED_FMT)"}')
[ "$c" = "400" ] && { echo "PASS  format injection -> 400"; pass=$((pass+1)); } || { echo "FAIL  format injection -> $c"; fail=$((fail+1)); }
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/compression/$ID_fx_png" -H 'Content-Type: application/json' -d '{"format":"mp4"}')
[ "$c" = "400" ] && { echo "PASS  cross-type format -> 400"; pass=$((pass+1)); } || { echo "FAIL  cross-type format -> $c"; fail=$((fail+1)); }
for res in '"4320"' '"__proto__"' '["720"]'; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d "{\"format\":\"original\",\"resolution\":$res}")
  [ "$c" = "400" ] && { echo "PASS  resolution $res -> 400"; pass=$((pass+1)); } || { echo "FAIL  resolution $res -> $c"; fail=$((fail+1)); }
done
for codec in '"x264 -vf x"' '"__proto__"' '{"a":1}'; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d "{\"format\":\"original\",\"codec\":$codec}")
  [ "$c" = "400" ] && { echo "PASS  codec $codec -> 400"; pass=$((pass+1)); } || { echo "FAIL  codec $codec -> $c"; fail=$((fail+1)); }
done
c=$(curl -s --path-as-is -o /dev/null -w '%{http_code}' "$API/compression/download/..%2Fpackage.json")
[ "$c" = "404" ] && { echo "PASS  compression id traversal -> 404"; pass=$((pass+1)); } || { echo "FAIL  compression id traversal -> $c"; fail=$((fail+1)); }
c=$(curl -s --path-as-is -o /dev/null -w '%{http_code}' "$API/conversion/download/..%2F..%2F..%2Fetc%2Fpasswd")
[ "$c" = "404" ] && { echo "PASS  conversion id traversal -> 404"; pass=$((pass+1)); } || { echo "FAIL  conversion id traversal -> $c"; fail=$((fail+1)); }
c=$(curl -s --path-as-is -o /dev/null -w '%{http_code}' -X DELETE "$API/upload/..%2Fpackage.json")
[ "$c" = "404" ] && { echo "PASS  delete traversal -> 404"; pass=$((pass+1)); } || { echo "FAIL  delete traversal -> $c"; fail=$((fail+1)); }
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/upload" -F "files=@fx.jpg;type=application/x-sh")
[ "$c" = "400" ] && { echo "PASS  bad mime -> 400"; pass=$((pass+1)); } || { echo "FAIL  bad mime -> $c"; fail=$((fail+1)); }
id=$(up "fx.jpg" "image/png")
case "$id" in
  *.png) echo "PASS  stored ext follows mime -> $id"; pass=$((pass+1));;
  *)     echo "FAIL  stored ext follows mime -> $id"; fail=$((fail+1));;
esac
head -c 60000000 /dev/zero > "$OUT/big.jpg"
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/upload" -F "files=@$OUT/big.jpg;type=image/jpeg")
[ "$c" = "400" ] && { echo "PASS  60MB upload -> 400"; pass=$((pass+1)); } || { echo "FAIL  60MB upload -> $c"; fail=$((fail+1)); }

# A foreign Origin must be refused outright, not merely denied the response
# headers: a multipart POST is a simple request, so CORS alone would still let
# a hostile page upload and start an encode. A request whose Origin matches the
# host it arrived on is the app itself and must still work.
ORIGIN_HOST=${API#*://}
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/upload" -H "Origin: https://evil.example" -F "files=@fx.png;type=image/png")
[ "$c" = "403" ] && { echo "PASS  foreign origin -> 403"; pass=$((pass+1)); } || { echo "FAIL  foreign origin -> $c"; fail=$((fail+1)); }
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/upload" -H "Origin: http://$ORIGIN_HOST" -F "files=@fx.png;type=image/png")
[ "$c" = "200" ] && { echo "PASS  same origin -> 200"; pass=$((pass+1)); } || { echo "FAIL  same origin -> $c"; fail=$((fail+1)); }

echo; echo "===== $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
