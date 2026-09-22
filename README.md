# FileMinify

A self-hosted web app for shrinking and converting files, and for merging anything
printable into a single PDF. Drop files in and they are processed immediately —
there is nothing to configure first.

Frontend is React + TypeScript, backend is Node/Express wrapping FFmpeg,
Ghostscript, ImageMagick, Sharp and LibreOffice. Everything runs in Docker.

## What it does

**Compression** — images (JPG, PNG, WebP, GIF), PDFs, and video (MP4, WebM, MOV,
AVI). One control, three tiers: *Smaller*, *Balanced* (default), *Best quality*.
The tier maps onto whatever each encoder actually understands, so it does something
real in every case rather than sending a number that gets ignored.

**Conversion** — only between formats that genuinely work, derived from one table
(`src/formats.ts`) that mirrors the backend:

| Source | Can become |
| --- | --- |
| Image | JPG, PNG, WebP, GIF, PDF |
| PDF | JPG, PNG, WebP, GIF |
| Video | MP4, WebM, MOV, AVI |
| Word / Excel / PowerPoint | PDF |

A file is never offered its own format, or one its type cannot reach — a PNG has no
route to MP4, so the option does not appear.

**Merge to PDF** — combine 2–20 files into one PDF in an order you control by
dragging. Images, PDFs and Office documents can all take part; video cannot become
a PDF and is listed as excluded with the reason. If any one file fails to convert,
nothing is merged and the response names the file, rather than quietly handing back
a document with a piece missing.

**Honest results** — when re-encoding would make a file *larger* (already-optimised
PDFs and video often do), the original is kept and reported as-is instead of being
presented as a saving.

Files are processed in place and deleted an hour after upload. There is no account,
no database, and nothing leaves the machine you run it on.

## Requirements

Docker and Docker Compose. Nothing else — Node is not needed on the host, since
both images build and run inside Docker.

## Install

```bash
git clone https://github.com/bardurnielsen/file-minify-redesign.git
cd file-minify-redesign
docker compose up -d --build
```

Then open **http://localhost:3051**.

The first build takes a while — the backend image installs LibreOffice, FFmpeg,
Ghostscript and ImageMagick, around 970 MB of packages. Later builds are cached and
take seconds.

```bash
docker compose logs -f backend     # follow the backend log
docker compose down                # stop
docker compose down -v             # stop and delete uploaded files
```

### Ports

Defined in `docker-compose.yml`; the app is on **3051** and the API on **4001**.
These are deliberately offset so this can run alongside the original FileMinify on
3050/4000. Change the left-hand side of each mapping to move them.

Only 3051 is published to the network. The API is bound to `127.0.0.1:4001` for
the smoke suite and for debugging from the host — nginx reaches the backend over
the Compose network, so nothing else needs it, and publishing it would be a second
front door that skips nginx and the rate limiting.

## Development

Both services build from the repo root. After editing:

```bash
docker compose up -d --build frontend   # frontend only
docker compose up -d --build backend    # backend only
```

The frontend image build runs `tsc && vite build`, so a successful build is also a
type check. There is no test framework configured.

Running outside Docker is possible (`npm install && npm run dev` at the root for
Vite on :5173, and in `backend/` for the API on :4000) but the backend then needs
FFmpeg, Ghostscript, ImageMagick and LibreOffice installed on the host. Docker is
the supported path. The Vite dev server proxies `/api` to :4000 the way nginx does
in the container, so the browser stays on one origin either way.

## API

The frontend talks to these directly; nginx proxies `/api/*` to the backend,
stripping the prefix.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/upload` | multipart, field `files`, up to 10 files of 50 MB. Returns an `id` per file |
| `POST` | `/compression/:id` | `{quality, format, maxSize}` → sizes and ratio |
| `GET` | `/compression/download/:id` | the compressed bytes |
| `POST` | `/conversion/:id` | `{format}` → sizes and formats |
| `GET` | `/conversion/download/:id` | the converted bytes |
| `POST` | `/merge` | `{ids: [...]}`, 2–20, merged in the order given → `{id, size, pageCount, fileCount}` |
| `GET` | `/merge/download/:id` | the merged PDF |
| `DELETE` | `/upload/:id` | discard an upload |
| `GET` | `/health` | `{"status":"ok"}` |

Errors are `{success: false, error: "..."}`. A merge that fails on one file also
returns `failedId` naming it.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | backend port inside the container |
| `NODE_ENV` | `production` | set by Compose |
| `MAX_FILE_SIZE` | `50MB` | per-file upload limit; bytes or a suffixed size |
| `CORS_ORIGIN` | *(empty)* | extra origins allowed in, comma-separated. Empty means same-origin only, which is all the app itself needs |

Compose also caps each container: 3 GB for the backend, 128 MB and half a CPU for
nginx, with `restart: unless-stopped` and health checks on both, so a heavy batch
cannot take the host with it and a reboot brings the app back.

The backend has no CPU cap on purpose. `cpus:` is not a limit that degrades —
Docker refuses to start the container at all when the value exceeds the host's
core count, so a number chosen on one machine stops the app dead on a smaller
one. Transcoding is also the whole job here, so throttling it mostly slows the
people using the app. Add one by hand if you want it, no higher than `nproc`.

## Notes on running this publicly

This is built for your own machine or a private network. What is in place:
Helmet, per-file type and size validation, rate limiting (600 requests per 15
minutes per client IP, counted from `X-Forwarded-For`), same-origin enforcement,
and resource caps on both containers.

Before exposing it beyond a trusted network, be aware:

- Uploads are unauthenticated. Anyone who can reach the app can spend CPU on video
  encoding — the container limits bound the damage, they do not prevent it.
- Temporary files are readable by any request that can guess a UUID.
- There is no TLS here; put it behind a reverse proxy that terminates HTTPS.

If you do front it with another proxy, pass the original `Host` header through
(`proxy_set_header Host $http_host`). The same-origin check compares the request's
`Origin` against it, and a proxy that rewrites `Host` will make the app reject its
own requests.

## Licence

MIT — see [LICENSE](LICENSE).
