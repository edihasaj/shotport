import packageMetadata from "../package.json";

export const VERSION = packageMetadata.version;

export function helpText(): string {
  return `shotport ${VERSION}

Usage:
  shotport window [--window <title>] [--region x,y,w,h] [flags]
  shotport browser <url|-> [--element <sel>] [--clip x,y,w,h] [--live] [flags]
  shotport app <name> [--window <title>] [--region x,y,w,h] [flags]
  shotport desktop [--region x,y,w,h] [flags]
  shotport ios [flags]
  shotport android [flags]
  shotport doctor            set up guiport's macOS permissions
  shotport ocr <image>       OCR an image file to text (Apple Vision)
  shotport ocr <image> --boxes  OCR to JSON with per-line bounding boxes (locate text)

Smart screenshot capture for agents: structured text first, budgeted pixels only when needed.
'window' captures whatever app is frontmost right now — including window text scrolled out of view.

Flags:
  --text-only          Print extracted text without writing a budgeted image
  --image-only         Write image and skip text extraction
  --json               Emit stable JSON
  --out <path>         Output image path; default is a temp file
  --budget <tokens>    Resize image to fit approximate token budget
  --max-px <pixels>    Max long edge before token budgeting (default: 1280)
  --max-chars <n>      Cap extracted text length (default: 6000)
  --full-text          Keep all extracted text — don't truncate
  --jpeg               Convert budgeted image to JPEG
  --webp               Convert budgeted image to WebP when cwebp exists
  --live               browser only: capture through an already-open, authenticated
                       Chrome via 'abx live' (endpoint from ABX_LIVE_CDP_URL)
  -h, --help           Show help
  --version            Print version

Examples:
  shotport window
  shotport window --full-text --text-only
  shotport browser https://example.com --element main --budget 900 --webp
  shotport app Calculator --window Calculator
  shotport desktop --region 0,0,1200,800 --json
`;
}
