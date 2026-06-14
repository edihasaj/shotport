# Changelog

All notable changes to shotport are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/edihasaj/shotport/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/edihasaj/shotport/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/edihasaj/shotport/releases/tag/v0.1.0
