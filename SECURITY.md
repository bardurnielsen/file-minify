# Security

## Reporting a vulnerability

Please report security issues privately, not in a public issue: use
**[Report a vulnerability](../../security/advisories/new)** on this repository's
Security tab. You will get a reply within a week, and a fix or a plan within 30
days for anything confirmed.

Useful to include: what an attacker can do, the steps to reproduce it, and the
version (commit) you tested.

## Scope

FileMinify is built for a trusted network. The README's
[Notes on running this publicly](README.md#notes-on-running-this-publicly) list
what it deliberately does not do - there is no authentication, and temporary
files can be fetched by anyone who knows their UUID. Reports that come down to
those are known limitations rather than vulnerabilities, but ideas for
addressing them are welcome as issues.

In scope, for example: reading or writing files outside the temp directory,
running commands, bypassing the upload type and size checks, the same-origin
check or the rate limiter, and anything that crashes or hangs the backend with a
crafted file.

## Supported versions

Only the latest `main` is supported.
