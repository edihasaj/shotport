# Security Policy

## Reporting a vulnerability

Email **edihasaj@gmail.com** with details. Do not file a public GitHub issue.

Please include:

- A description of the vulnerability.
- Steps to reproduce.
- Affected version/commit.
- Expected vs. observed impact.

You'll get an acknowledgement within 72 hours and a status update within 7 days.

## Threat model

shotport captures the screen and reads UI text. To do its job it:

- Shells out to capture backends (`abx`, `guiport`, `screencapture`, `xcrun simctl`, `adb`) and OCR tools (`swift`/Vision, `tesseract`).
- Reads accessibility text and pixels from whatever app or page is targeted.
- Writes image files to a temp directory (or the `--out` path you choose).

That means:

- **Captured content may contain secrets.** A screenshot or accessibility dump of a logged-in app can include tokens, emails, or private data. Treat `shotport` output paths and stdout as sensitive.
- **Only run shotport binaries you trust.** It invokes local tools and writes files as the current user.
- **On macOS, desktop/app capture requires Screen Recording permission** for the invoking terminal. shotport never escalates on its own — if the grant is missing it returns a `screen_recording_not_granted` note and whatever text it could read.

## Hardening tips

- Don't pipe raw `shotport` output into logs or analytics — text extraction can surface on-screen secrets.
- Use `--text-only` when you only need content; it never writes an image file.
- Point `--out` at a directory you control and clean up temp captures after use.
- Review captures before attaching them to issues or PRs.

## Supported versions

Pre-1.0: only the latest minor receives fixes.
