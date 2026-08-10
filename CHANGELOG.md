# Changelog

All notable changes to shotport are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2026-08-10

### Changed

- macOS region capture now captures through guiport and crops locally instead
  of falling back to `screencapture`, preserving the single permission identity.

## [0.3.3] - 2026-08-10

### Changed

- `shotport doctor` now delegates macOS permission setup to the signed guiport
  app. Shotport no longer requests its own Screen Recording or Accessibility
  entries.

## [0.3.0]

### Added

- **Cross-platform capture** (`src/platform.ts`): Windows (PowerShell GDI
  `CopyFromScreen` for the screen, user32 `PrintWindow` for an app window by
  title) and Linux (`grim`/`scrot`/ImageMagick `import`). macOS unchanged.
- **Windows OCR** via the built-in `Windows.Media.Ocr` WinRT engine (no
  tesseract needed); Linux OCR via tesseract. `shotport ocr`, `app`, `desktop`,
  and `window` now work on all three OSes.
- Release now also publishes a **Windows** binary.

### Notes

- Windows **screen capture** needs an interactive desktop session — run shotport
  as the logged-in user (Task Scheduler "only when logged on" / startup), not a
  service/SSH (session 0) context. OCR of a file works in any session.

## [0.2.2]

### Added

- **`shotport ocr <image>`**: OCR an image file to text via Apple Vision
  (falls back to tesseract). Exposes the OCR shotport already used internally, so
  agents can extract text from any screenshot (e.g. reply text from a chat UI
  whose WebView content the a11y tree does not expose).

## [0.2.1]

### Added

- **`shotport doctor`**: check and request the macOS Screen Recording permission
  via native APIs (`CGRequestScreenCaptureAccess`), so a fresh install prompts
  the user and registers shotport in the permission list instead of needing a
  manual add. Opens the relevant System Settings pane when a toggle is still
  needed; also reports Accessibility status.

- **`browser --live`**: capture through an already-open, authenticated Chrome via
  `abx live` (endpoint from `ABX_LIVE_CDP_URL`), so logged-in apps can be
  screenshotted instead of a fresh, unauthenticated session. Opt-in (not
  env-auto). Live mode maps around the different `abx live` command set
  (`snapshot` instead of `accessibility`; `wait` is best-effort).

## [0.2.0]

### Added

- `shotport window` — capture whatever app is **frontmost** right now, no app name needed. Resolves the active app via `guiport apps`, then dumps the focused window's full accessibility tree (including text scrolled out of view) and budgets a screenshot only when asked. Inspired by Codex "appshots".
- `--full-text` and `--max-chars <n>` flags to control text truncation, so large windows aren't silently cut off at the 6000-char default.
- Brand assets: `assets/logo.svg`, `assets/icon.svg`, and rendered PNG/`.icns` sets.
- Open-source scaffolding: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub issue/PR templates, and CI/release workflows.
- `scripts/install.sh` for a one-line build-and-install from source.

### Fixed

- Capture wrote to a hardcoded `/private/tmp` path, which doesn't exist on Linux — now uses the OS temp dir (`os.tmpdir()`) so capture works on Linux too. Regression test added.

## [0.1.0]

### Added

- Initial `shotport` CLI: token-cheap screenshot capture for coding agents.
- Targets: `browser`, `app`, `desktop`, `ios`, `android`.
- Text-first output — accessibility text and OCR (Apple Vision, then tesseract) printed to stdout, image written only when needed.
- Token budgeting: `--budget`, `--max-px`, `--jpeg`, `--webp`.
- Output modes: `--text-only`, `--image-only`, `--json`, `--out`.
- Graceful backend degradation — missing tools return a clean note instead of crashing.

[Unreleased]: https://github.com/edihasaj/shotport/compare/v0.3.4...HEAD
[0.3.4]: https://github.com/edihasaj/shotport/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/edihasaj/shotport/compare/v0.3.2...v0.3.3
[0.2.0]: https://github.com/edihasaj/shotport/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/edihasaj/shotport/releases/tag/v0.1.0
