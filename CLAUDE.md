# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project overview

FileMinify compresses and converts files, and merges anything printable into a
single PDF. React + TypeScript frontend, Node/Express backend shelling out to
FFmpeg, Ghostscript, ImageMagick and LibreOffice, all in Docker behind nginx.

This repo is a redesign of the original FileMinify. It shares history up to
`dbcf931`; everything after that is the rework.

## Running it

**This project runs in Docker Compose. Do not run npm on the host — Node is not
installed there.**

```bash
docker compose up -d --build            # everything
docker compose up -d --build frontend   # after a frontend change
docker compose up -d --build backend    # after a backend change
docker compose logs --tail=30 backend
```

App on **http://localhost:3051**, API on **4001**. The offset from 3050/4000 is
deliberate so this can run beside the original.

The frontend image build runs `tsc && vite build`, so a clean build is the type
check. No test framework is configured.

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

- `server.js` — Express setup, `/health`, and an hourly sweep deleting temp files
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

## Behaviour worth knowing

- **Compression can inflate.** Re-encoding already-compressed input often grows it.
  When the result is no smaller and the format is unchanged, the backend keeps the
  original and reports `compressionRatio: "1.00"`. The UI shows this as "already
  compact", not as a failure.
- **Video ignores numeric quality.** With `maxSize` set, FFmpeg runs two-pass
  targeting that size and the quality value does nothing. PDF and video take a
  *named* level (`low|medium|high`), not a number — hence tiers.
- **`maxSize` means different things per type**: a target file size for video, but
  a megapixel cap for images, where it silently downscales.
- **Merging is atomic.** One unconvertible file fails the whole merge, with
  `failedId` naming it. The UI offers leaving it out.
- **Merge uses the processed output** (`processedId ?? serverId`), so a converted
  docx is not pushed through LibreOffice twice.
- **The rate limiter never fires.** It is mounted on `/api/`, but nginx strips that
  prefix before proxying, so the backend never sees a matching path.
- **PNG quality is non-monotonic in Sharp** — "Smaller" can produce a larger PNG
  than "Balanced".
- Temp files are `<uuid>.<ext>` in `/app/temp` on the `temp_files` volume, swept
  hourly. The volume survives `docker compose down`; use `-v` to clear it.

## Testing

No unit tests. There is an API smoke suite covering upload, compression,
conversion and error handling at `/home/bn/.cache/fm-test/smoke4001.sh` (targets
:4001), with fixtures beside it. `curl` needs an explicit `;type=<mime>` on `-F`
uploads or the MIME allowlist rejects the file.
