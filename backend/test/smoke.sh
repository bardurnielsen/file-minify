#!/usr/bin/env bash
# API smoke suite. Needs the stack running: docker compose up -d --build
#   ./backend/test/smoke.sh                       # default port
#   ./backend/test/smoke.sh http://localhost:4000 # somewhere else
set -u
API="${1:-http://localhost:4000}"
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
check "compress pdf (med)"  "$(curl -s -X POST "$API/compression/$ID_fx_pdf" -H 'Content-Type: application/json' -d '{"quality":"medium"}')" compression
check "compress mp4 (med)"  "$(curl -s -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d '{"quality":"medium","format":"mp4"}')" compression

echo; echo "=== CONVERSION ==="
check "jpg -> webp"   "$(curl -s -X POST "$API/conversion/$ID_fx_jpg"  -H 'Content-Type: application/json' -d '{"format":"webp"}')" conversion
check "png -> pdf"    "$(curl -s -X POST "$API/conversion/$ID_fx_png"  -H 'Content-Type: application/json' -d '{"format":"pdf"}')"  conversion
check "pdf -> png"    "$(curl -s -X POST "$API/conversion/$ID_fx_pdf"  -H 'Content-Type: application/json' -d '{"format":"png"}')"  conversion
check "docx -> pdf"   "$(curl -s -X POST "$API/conversion/$ID_fx_docx" -H 'Content-Type: application/json' -d '{"format":"pdf"}')"  conversion
check "mp4 -> webm"   "$(curl -s -X POST "$API/conversion/$ID_fx_mp4"  -H 'Content-Type: application/json' -d '{"format":"webm"}')" conversion
check "mp4 -> avi"    "$(curl -s -X POST "$API/conversion/$ID_fx_mp4"  -H 'Content-Type: application/json' -d '{"format":"avi"}')"  conversion

echo; echo "=== ERROR HANDLING ==="
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/compression/nope.pdf" -H 'Content-Type: application/json' -d '{}')
[ "$c" = "404" ] && { echo "PASS  missing file -> 404"; pass=$((pass+1)); } || { echo "FAIL  missing file -> $c"; fail=$((fail+1)); }
c=$(curl -s -X POST "$API/conversion/$ID_fx_docx" -H 'Content-Type: application/json' -d '{"format":"png"}' -o /dev/null -w '%{http_code}')
[ "$c" = "400" ] && { echo "PASS  docx->png rejected 400"; pass=$((pass+1)); } || { echo "FAIL  docx->png -> $c"; fail=$((fail+1)); }

echo; echo "=== SECURITY REGRESSIONS ==="
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/compression/$ID_fx_mp4" -H 'Content-Type: application/json' -d '{"format":"mp4$(touch /app/PWNED_FMT)"}')
[ "$c" = "400" ] && { echo "PASS  format injection -> 400"; pass=$((pass+1)); } || { echo "FAIL  format injection -> $c"; fail=$((fail+1)); }
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/compression/$ID_fx_png" -H 'Content-Type: application/json' -d '{"format":"mp4"}')
[ "$c" = "400" ] && { echo "PASS  cross-type format -> 400"; pass=$((pass+1)); } || { echo "FAIL  cross-type format -> $c"; fail=$((fail+1)); }
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

echo; echo "===== $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
