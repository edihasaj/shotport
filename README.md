# shotport

`shotport` does the heavy screenshot work for coding agents: capture through the right local tool, extract text first, resize the image to a token budget, then print a compact result.

The default output is intentionally cheap:

```text
target: browser https://example.com · 1280x720 webp -> /tmp/shotport-x/capture.webp (~1.2k img tokens)
TEXT (a11y):
Example Domain
...
```

Agents can read the text from stdout and only open the image path when pixels are actually needed. This is the automation layer for the screenshot-token cost that `spendwatch` surfaced: no more sending raw 4M+ token screenshots when a budgeted image plus accessibility/OCR text will do.

## Install

Requires Bun on the build machine.

```sh
bun install
bun run build
install -m 0755 ./dist/shotport /opt/homebrew/bin/shotport
```

Shortcut:

```sh
bun run install:local
```

The binary is standalone after compilation. Runtime backends are optional and checked gracefully:

- `abx` for browser capture, accessibility text, selectors, and clips
- `guiport` for macOS app/desktop screenshots and accessibility text
- `screencapture`, `sips`, `xcrun simctl`, and `adb` for native fallbacks
- Apple Vision via `swift`, then `tesseract`, for OCR fallback
- `cwebp` for WebP output when requested

## Usage

```sh
shotport browser <url|-> [--element <sel>] [--clip x,y,w,h] [flags]
shotport app <name> [--window <title>] [--region x,y,w,h] [flags]
shotport desktop [--region x,y,w,h] [flags]
shotport ios [flags]
shotport android [flags]
```

Flags:

```text
--text-only          Print extracted text without writing a budgeted image
--image-only         Write image and skip text extraction
--json               Emit stable JSON
--out <path>         Output image path; default is a temp file
--budget <tokens>    Resize image to fit approximate token budget
--max-px <pixels>    Max long edge before token budgeting (default: 1280)
--jpeg               Convert budgeted image to JPEG
--webp               Convert budgeted image to WebP when cwebp exists
```

Examples:

```sh
shotport browser https://example.com
shotport browser https://example.com --element main --budget 900 --webp
shotport app Calculator --window Calculator
shotport desktop --region 0,0,1200,800 --json
shotport ios --budget 1200 --jpeg
shotport android --text-only
```

## Backends

Browser flow:

1. `abx goto <url>`
2. `abx wait --networkidle`
3. `abx accessibility`
4. `abx screenshot [--clip x,y,w,h] [selector] <path>`

App flow:

1. `guiport tree --app <name> [--window <title>]`
2. `guiport screenshot --app <name> [--window <title>] -o <path>`
3. `screencapture -R` when `--region` is used

Desktop flow uses `guiport screenshot` when present, then `screencapture`. iOS uses `xcrun simctl io booted screenshot`. Android uses `adb exec-out screencap -p` and returns a clean missing-backend note when `adb` is absent.

## Development

```sh
bun test
bun run typecheck
bun run build
```

No analytics. No secrets. MIT licensed.
