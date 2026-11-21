# Privacy

FileMinify has no accounts, no database and no telemetry or analytics. It works
on the computer you run it on, and nothing is sent to the developer or anyone
else.

## Your files

- Files are processed only on the computer running FileMinify: the Windows app
  on your PC, or your own server if you run it in Docker.
- Uploaded files and results are kept in a temporary folder and deleted
  automatically. Every hour, anything older than an hour is removed, so a file
  stays at most about two hours. Downloading or deleting a file in the app
  removes it sooner.

## Phone access (Windows app)

- Off by default: the app then answers only on this PC (`127.0.0.1`).
- When you switch it on, FileMinify listens on your local network, so phones on
  the same Wi-Fi can use it. Files from a phone go only to that PC.
- It is not reachable from the internet unless you forward a port to it
  yourself.

## Network connections the Windows app makes

- **Updates:** it checks this project's GitHub releases
  (`github.com/bardurnielsen/file-minify`) for a newer version.
- **Tools:** on first start, and only if you agree, it installs FFmpeg,
  ImageMagick, LibreOffice and the Visual C++ runtime with Windows' own
  `winget`, from the winget catalog.
- **Links** such as "Get in touch" open in your browser only when you click
  them.

## Logs

Logs stay on your PC (`%LOCALAPPDATA%\FileMinify\logs`) and are never sent
anywhere.

## Questions

Open an issue on GitHub, or see [SECURITY.md](SECURITY.md) for reporting a
security problem privately.
