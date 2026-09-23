# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project overview

FileMinify compresses and converts files, and merges anything printable into a
single PDF. React + TypeScript frontend, Node/Express backend shelling out to
FFmpeg, Ghostscript, ImageMagick and LibreOffice, all in Docker behind nginx.

This repo began as a redesign of the first FileMinify, which is now retired
(its repository was deleted on 2026-09-23). History up to `f4d6b79` is that
project's; everything after is the rework. Its last fixes (rate limiter,
upload holes, smoke suite) live on here as `d96fa4c`, `53673ab` and `3f95c5c`.

The history was rewritten once, on 2026-09-23, before the repo went public: a
personal document committed by mistake early on was removed from every commit
and author emails were normalised. Commit IDs before that date differ from any
older clone or PR link. Security reports: see SECURITY.md.

## Running it

**This project runs in Docker Compose. Do not run npm on the host — Node is not
installed there.**

```bash
docker compose up -d --build            # everything
docker compose up -d --build frontend   # after a frontend change
docker compose up -d --build backend    # after a backend change
docker compose logs --tail=30 backend
```

App on **http://localhost:3051**, API on **4001**. The offset from 3050/4000
dates from running beside the first version; the ports stay as they are, since
deployments and bookmarks use them.

The frontend image build runs `tsc -b && eslint . && vite build`, so a clean build
is the type check and lint. It must be `tsc -b`: the root tsconfig.json is a
solution file (`"files": []` plus references), and plain `tsc` checks zero files
- it did, silently, until the build was fixed. No test framework is configured.

## Architecture

### Frontend

- `src/processing.ts` — the decision layer. `routeFor` decides compression vs
  conversion, `requestBodyFor` turns a tier into what each backend route actually
  understands, plus staleness and output naming.
- `src/formats.ts` — the single source of truth for which target formats each
  source type supports. Mirrors the branches in `backend/routes/conversion.js`.
- `src/components/file-processor/FileProcessor.tsx` — orchestrator. Per-file XHR
  upload with real progress, two concurrency lanes (3 general, 1 for LibreOffice
  work), rerun, download-all.
- `FileRow` / `AdjustPanel` / `DropZone` / `TierControl` / `MergeDialog` — the UI.
- `src/lib/api.ts` (fetch wrappers), `src/lib/format.ts` (byte and percentage
  formatting), `src/hooks/useFiles.ts` (zustand store), `src/types.ts`.

### Backend

- `server.js` — Express setup, `/health`, `/config` (upload limits for the
  frontend), and an hourly sweep deleting temp files
  and stale `merge-*` scratch directories older than an hour.
- `routes/upload.js` — Multer, `<uuid><ext>` naming, MIME allowlist.
- `routes/compression.js` — Sharp (images), Ghostscript (PDF), FFmpeg (video).
- `routes/conversion.js` — between formats, using the shared converters.
- `routes/merge.js` — ordered merge into one PDF via pdf-lib.
- `utils/converters.js` — `toPdf` plus `PDF_SOURCE_EXTS`, shared by conversion and
  merge, and the LibreOffice lock.

## Invariants — these are fixed bugs, do not regress them

1. **`formats.ts` is the source of truth.** Never offer a file its own format, or
   one its type cannot reach. Adding a backend format means updating both sides.
2. **One routing rule.** `routeFor` decides both how a file is processed and where
   it is downloaded from. These were once two hand-maintained condition lists that
   drifted, sending downloads to the wrong route.
3. **`-y` on every FFmpeg invocation.** Without it FFmpeg prompts before
   overwriting an existing output and blocks forever, because `exec()` gives it no
   stdin. This hung the app three separate times: two-pass output to `/dev/null`,
   and converting a video to its own format (making output == input). Any shelled
   command that might overwrite needs its non-interactive flag.
4. **LibreOffice is serialised** through `withOfficeLock`. Headless mode holds a
   per-profile lock; a second concurrent conversion fails outright.
5. **`format: 'original'` means "keep the source format"** and is resolved to the
   source extension server-side. It must never reach a filename or an encoder as a
   literal — it once produced files named `compressed-<uuid>.original`.
6. **The backend port stays on `127.0.0.1`.** Published on `0.0.0.0` it is a second
   front door that skips nginx, and because `trust proxy` makes Express believe
   `X-Forwarded-For`, a direct client can set that header per request and rotate
   itself out of the rate limiter. Verified: rotating the header held
   `RateLimit-Remaining` at 599 indefinitely.
7. **nginx forwards `Host` as `$http_host`, not `$host`.** `$host` strips the port,
   so the same-origin check compared `example` against an `Origin` of
   `example:3051` and rejected the app's own uploads with a 403.
8. **An nginx `add_header` in a nested location drops every inherited one.** The
   asset-cache block therefore uses `expires` alone — when it also set
   `Cache-Control` by hand, every JS and CSS file was served with no CSP and no
   `X-Frame-Options`.
9. **No `cpus:` on the backend.** Docker refuses to start a container whose
   `cpus` exceeds the host's core count, rather than clamping — `cpus: 4.0`,
   picked on a 12-core dev machine, stopped the backend dead on CI's two-core
   runner and would have done the same on any smaller server. Memory is the
   limit that protects the host; keep `mem_limit`. A value at or below 1 (as
   the frontend uses) is safe anywhere. To be a good neighbour on a shared
   host the backend uses `cpu_shares` instead: a relative weight, which only
   bites under contention and cannot be too large for any host.

## Behaviour worth knowing

- **Compression can inflate.** Re-encoding already-compressed input often grows it.
  When the result is no smaller and the format is unchanged, the backend keeps the
  original and reports `compressionRatio: "1.00"`. The UI shows this as "already
  compact", not as a failure.
- **Video ignores numeric quality.** With `maxSize` set, FFmpeg runs two-pass
  targeting that size and the quality value does nothing. PDF and video take a
  *named* level (`low|medium|high`), not a number — hence tiers.
- **Video tiers differ by resolution and a bitrate ceiling, not just CRF.**
  On an already-lean source (a 4 Mbps 1080p phone clip) CRF alone asked for
  more bits than the source had, so Balanced and Best both came out larger and
  the original was kept. Each tier now also caps peak bitrate at a share of the
  source's (45/55/80% for H.264, a quarter lower for H.265, scaled down further
  when the picture is), and by default caps the short side (720p / 1080p /
  1440p). Nothing is ever kept at 4K: 1440p is the ceiling for every path,
  including target size and an explicit `resolution` (`1440|1080|720|480`;
  `source` is still accepted and means 1440). On the test server a 4K Best encode
  ran at 0.08x real time. A `resolution` option overrides the tier's cap; with
  a target size, the resolution is picked from the bitrate the target allows.
  `codec: 'h265'` is MP4/MOV only and tagged `hvc1` for Apple players. See
  `VIDEO_SETTINGS` in `routes/compression.js`.
- **Videos wait for the user.** A dropped video uploads straight away but is
  held (`FileItem.hold`, status `ready`) with its settings panel open until
  Compress is pressed: an encode takes minutes, can't be cancelled, and target
  size is the setting that matters most. Everything else starts on drop.
- **`set_mempolicy: Operation not permitted` from x265 is harmless.** x265 asks
  the kernel to place each worker thread's memory (a NUMA optimisation); newer
  Docker seccomp profiles refuse that call without CAP_SYS_NICE, so it prints
  one line per thread and carries on. Don't grant the capability to silence it.
- **Results describe themselves.** `POST /compression` returns `details` (video:
  preset, codec, output and source short side; images: quality; PDFs: preset),
  null when the original was kept. `outputNameFor` builds the download name from
  it and `describeResult` the row's line; the backend writes the same into the
  file (`-metadata comment` on video, EXIF ImageDescription - ASCII only - on
  images, Producer on repacked PDFs). Video output drops all source metadata
  (`-map_metadata -1`), GPS included; Sharp already drops it for images.
- **Photos are auto-oriented** (`autoOrient()` in Sharp, `-auto-orient` for
  image→PDF). Sharp strips the EXIF Orientation tag with the rest of the
  metadata, so without it a phone's portrait photo came out sideways. Pinned in
  smoke by `fx-rotated.jpg`.
- **Office → PDF honours the tier.** The conversion route takes an optional
  `quality` (`low|medium|high`) for Office files and runs the LibreOffice PDF
  through Ghostscript at that level, keeping whichever is smaller. Other
  conversions ignore quality.
- **Every Ghostscript PDF is then repacked by pdf-lib** into compressed object
  streams (lossless). Ghostscript 10.00 writes objects loose, so a spreadsheet
  with thousands of hyperlinks stayed ~1.3 MB at every tier; repacked it is
  ~570 KB. Best effort: if pdf-lib can't read the file, or the repack isn't
  smaller, the Ghostscript output is kept.
- **Ghostscript exits 0 on a PDF that needs a password to open** and writes a
  blank page, which used to come back as a 95% saving. `needsPassword` spots
  its stderr message and the route answers 422 instead. PDFs that only
  restrict printing or editing still work. Merge reports the same case itself.
- **`maxSize` is video only**: a target file size in MB. Images once treated it as
  a silent megapixel cap; that is gone.
- **A missing `format` means `original`** on compression, same as sending it.
- **Merging is atomic.** One unconvertible file fails the whole merge, with
  `failedId` naming it. The UI offers leaving it out.
- **Merge uses the processed output** (`processedId ?? serverId`), so a converted
  docx is not pushed through LibreOffice twice.
- **A foreign `Origin` is rejected with a 403**, not just denied CORS headers. A
  multipart POST is a "simple" request: the browser sends it regardless and only
  hides the reply, so CORS alone still let a hostile page upload a file and start
  an encode. `CORS_ORIGIN` opts specific origins back in; a request with no
  `Origin` at all (curl, the smoke suite) is left alone.
- **The rate limiter is mounted on the paths nginx actually delivers** (`/upload`,
  `/compression`, `/conversion`, `/merge`) rather than `/api/`, which the proxy
  strips. `trust proxy` is set to 1 so clients are counted by `X-Forwarded-For`
  and not by nginx's own container address. `/health` is exempt.
- **PNG quality is non-monotonic in Sharp** — "Smaller" can produce a larger PNG
  than "Balanced".
- Temp files are `<uuid>.<ext>` in `/app/temp` on the `temp_files` volume, swept
  hourly. The volume survives `docker compose down`; use `-v` to clear it.

## Testing

Two suites, both against a running stack and both in CI (jobs `backend` and
`e2e`, required on `main`):

- `backend/test/smoke.sh` - the API: every route, the error paths and the
  security regressions (below).
- `e2e/run.sh` - the browser suite (Playwright, `e2e/tests/`): drop-and-process,
  held videos and their settings, labelled download names, merge, sliders and
  the format picker, untyped uploads, the drag overlay, the video queue, the
  settings panel's exit. It runs in the Playwright image whose tag run.sh reads
  from `e2e/package.json` (pinned exactly, so a Dependabot bump moves both),
  and makes its test videos with the backend's ffmpeg (`e2e/make-media.sh`).
  Every test also fails on any browser console error. Each of its bug tests
  was checked by re-introducing the bug and watching it fail.
- `e2e/screenshots/update.sh` regenerates the README screenshots
  (`docs/screenshots/*-{light,dark}.png`) from demo files it makes with the
  backend's tools. Re-run it after a visible UI change; don't edit the PNGs.

Per-server settings (`MAX_FILE_MB`, `PROCESS_TIMEOUT_MIN`, `BACKEND_CPU_SHARES`,
`TEMP_DIR`) come from an optional `.env` beside `docker-compose.yml`; see
`.env.example`. nginx's config is a template (`frontend/nginx.conf.template`)
whose upload limit and read timeout `frontend/nginx-limits.envsh` derives from
the same settings at container start - never hard-code them again.

`backend/test/bench.sh` times every tier and codec on the current host; use it to
choose those settings.

No unit tests. There is an API smoke suite at `backend/test/smoke.sh`, with
fixtures beside it. It needs the stack running and defaults to :4001; pass a
base URL to point it elsewhere. It exits non-zero on failure.

It covers upload, compression, conversion, merge, error handling, and a security block
pinning the bugs fixed in `53673ab` — format injection, `id` path traversal on
the download and delete routes, MIME rejection, the upload size cap, and the
same-origin check in both directions. Those last cases are regression tests: if
one starts failing, a hole has reopened.

CI (`.github/workflows/docker-build.yml`) runs one job per image: `frontend`
builds (and so type-checks and lints), `backend` builds, starts that exact image and runs
the smoke suite. Each caches under its own `gha` scope - with a shared scope the
two overwrote each other and the apt layer was rebuilt every run. Build contexts
are trimmed per image by `<Dockerfile>.dockerignore`. Docs-only pushes to `main`
skip CI, but PRs always run it: `main` requires both checks, and a required
check that never reports would block the PR. Actions are pinned to commit SHAs;
Dependabot (`.github/dependabot.yml`) proposes updates for npm, the Docker base
images and the actions weekly.

`curl` needs an explicit `;type=<mime>` on `-F` uploads or the MIME allowlist
rejects the file.
