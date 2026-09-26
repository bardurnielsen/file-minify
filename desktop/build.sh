#!/usr/bin/env bash
# Builds the Windows desktop app (Electron) and its installer. Runs on Windows
# in Git Bash, as the CI runner does, with Node 24 and 7-Zip:
#   desktop/build.sh 2.0.0    -> build/desktop/FileMinify-Setup-2.0.0.exe (+ latest.yml, .blockmap)
# The backend and the built app go in as plain files beside the app
# (extraResources), not into the asar: the backend's node_modules, sharp's
# Windows binary included, are installed here exactly as for 1.0.x.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:?usage: desktop/build.sh <version>}"
# Ghostscript is bundled because winget has no package for it (its installer
# is interactive-only, microsoft/winget-pkgs#267547). A release tag of
# github.com/ArtifexSoftware/ghostpdl-downloads, with its checksum pinned here
# (from Artifex's SHA512SUMS on a bump), so a tampered download can't bring
# its own matching checksum.
GS_TAG=gs10080
GS_SHA512=cb3ecc798508851ba28b05e3fb914ddefe78168190726376d8581546ce61d5b216ffa3359e6f829072786bc12350501c7b6f99110d578696b87213d157774269
STAGE=build/stage
rm -rf "$STAGE" build/desktop
mkdir -p "$STAGE/backend" "$STAGE/tools"

# The app: the same build as the frontend image (tsc, eslint, vite -> dist/).
npm ci --no-audit --no-fund
npm run build

# The backend, with production dependencies installed here so sharp brings its
# Windows binary.
cp -r backend/server.js backend/package.json backend/package-lock.json \
      backend/routes backend/utils backend/middleware "$STAGE/backend/"
(cd "$STAGE/backend" && npm ci --omit=dev --no-audit --no-fund)

# Ghostscript, unmodified, from Artifex's installer (7-Zip unpacks NSIS). It is
# AGPL: its licence and a pointer to the source go with it. It runs on the
# VC++ runtime, a winget dependency.
gs_exe=${GS_TAG}w64.exe
curl -fsSLo "$STAGE/$gs_exe" "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/$GS_TAG/$gs_exe"
echo "$GS_SHA512  $STAGE/$gs_exe" | sha512sum -c -
7z x -y -bso0 -o"$STAGE/gs-unpacked" "$STAGE/$gs_exe"
mkdir -p "$STAGE/tools/gs"
cp -r "$STAGE/gs-unpacked/bin" "$STAGE/gs-unpacked/lib" "$STAGE/gs-unpacked/Resource" \
      "$STAGE/gs-unpacked/iccprofiles" "$STAGE/tools/gs/"
rm -f "$STAGE/tools/gs/bin/gswin64.exe" "$STAGE/tools/gs/bin/gsdll64.lib"
cp "$STAGE/gs-unpacked/doc/COPYING" "$STAGE/tools/gs/COPYING.txt"
cat > "$STAGE/tools/gs/SOURCE.txt" <<SRC
GPL Ghostscript ($GS_TAG), unmodified, by Artifex Software, Inc.
Licence: GNU AGPL v3 (COPYING.txt).
Binaries and source (ghostscript-*.tar.xz), from Artifex:
https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/$GS_TAG
SRC
rm -rf "$STAGE/gs-unpacked" "$STAGE/$gs_exe"

# The Electron app and its installer. The version comes from here, so the
# desktop package.json's own number never needs bumping.
cd desktop
npm ci --no-audit --no-fund
npx electron-builder --win nsis --x64 --publish never -c.extraMetadata.version="$VERSION"
ls -l ../build/desktop/FileMinify-Setup-*.exe ../build/desktop/latest.yml
