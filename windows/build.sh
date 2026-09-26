#!/usr/bin/env bash
# Builds the Windows installer. Runs on Windows in Git Bash (as the CI runner
# does), with Node and Inno Setup 6 installed:
#   windows/build.sh 1.2.0    -> build/windows/FileMinify-Setup-1.2.0.exe
# It bundles its own node.exe, so the PC it is installed on needs no Node.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:?usage: windows/build.sh <version>}"
# The runtime shipped inside. Keep it on the LTS line the Docker image uses.
NODE_VERSION=v22.23.3
# Ghostscript is bundled because winget has no package for it (its installer
# is interactive-only, microsoft/winget-pkgs#267547). A release tag of
# github.com/ArtifexSoftware/ghostpdl-downloads.
GS_TAG=gs10080
OUT=build/windows
APP=$OUT/app
rm -rf "$OUT"
mkdir -p "$APP/backend"

# The app: the same build as the frontend image (tsc, eslint, vite -> dist/).
npm ci --no-audit --no-fund
npm run build
cp -r dist "$APP/dist"

# The backend, with production dependencies installed here so Sharp brings its
# Windows binary.
cp -r backend/server.js backend/package.json backend/package-lock.json \
      backend/routes backend/utils backend/middleware "$APP/backend/"
(cd "$APP/backend" && npm ci --omit=dev --no-audit --no-fund)

# Node itself, checked against nodejs.org's published checksums.
zip=node-$NODE_VERSION-win-x64.zip
curl -fsSLo "$OUT/$zip" "https://nodejs.org/dist/$NODE_VERSION/$zip"
curl -fsSLo "$OUT/SHASUMS256.txt" "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
(cd "$OUT" && grep " $zip\$" SHASUMS256.txt | sha256sum -c -)
# Windows' own tar (bsdtar) reads zip files; Git Bash's GNU tar does not.
"$(cygpath "$SYSTEMROOT")/System32/tar.exe" -xf "$OUT/$zip" -C "$OUT"
cp "$OUT/node-$NODE_VERSION-win-x64/node.exe" "$APP/"
cp "$OUT/node-$NODE_VERSION-win-x64/LICENSE" "$APP/node-LICENSE.txt"

# Ghostscript, unmodified, from Artifex's installer (7-Zip unpacks NSIS). It is
# AGPL: its licence and a pointer to the source go with it. What it needs at
# run time besides these is the VC++ runtime, a winget dependency.
gs_exe=${GS_TAG}w64.exe
curl -fsSLo "$OUT/$gs_exe" "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/$GS_TAG/$gs_exe"
curl -fsSLo "$OUT/SHA512SUMS" "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/$GS_TAG/SHA512SUMS"
(cd "$OUT" && grep " $gs_exe\$" SHA512SUMS | sha512sum -c -)
7z x -y -bso0 -o"$OUT/gs" "$OUT/$gs_exe"
mkdir -p "$APP/tools/gs"
cp -r "$OUT/gs/bin" "$OUT/gs/lib" "$OUT/gs/Resource" "$OUT/gs/iccprofiles" "$APP/tools/gs/"
rm -f "$APP/tools/gs/bin/gswin64.exe" "$APP/tools/gs/bin/gsdll64.lib"
cp "$OUT/gs/doc/COPYING" "$APP/tools/gs/COPYING.txt"
cat > "$APP/tools/gs/SOURCE.txt" <<SRC
GPL Ghostscript ($GS_TAG), unmodified, by Artifex Software, Inc.
Licence: GNU AGPL v3 (COPYING.txt).
Binaries and source (ghostscript-*.tar.xz), from Artifex:
https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/$GS_TAG
SRC

cp windows/launcher.js "$APP/"
cp public/favicon.ico "$APP/fileminify.ico"
cp LICENSE "$APP/LICENSE.txt"

ISCC=$(command -v iscc || echo "/c/Program Files (x86)/Inno Setup 6/ISCC.exe")
# MSYS would otherwise rewrite /DAppVersion=... as if it were a path.
MSYS_NO_PATHCONV=1 "$ISCC" /Q "/DAppVersion=$VERSION" windows/fileminify.iss
ls -l "$OUT"/FileMinify-Setup-*.exe
