export const VERSION = "0.1.0";

export function helpText(): string {
  return `shotport ${VERSION}

Usage:
  shotport browser <url|-> [--element <sel>] [--clip x,y,w,h] [flags]
  shotport app <name> [--window <title>] [--region x,y,w,h] [flags]
  shotport desktop [--region x,y,w,h] [flags]
  shotport ios [flags]
  shotport android [flags]

Smart screenshot capture for agents: structured text first, budgeted pixels only when needed.

Flags:
  --text-only          Print extracted text without writing a budgeted image
  --image-only         Write image and skip text extraction
  --json               Emit stable JSON
  --out <path>         Output image path; default is a temp file
  --budget <tokens>    Resize image to fit approximate token budget
  --max-px <pixels>    Max long edge before token budgeting (default: 1280)
  --jpeg               Convert budgeted image to JPEG
  --webp               Convert budgeted image to WebP when cwebp exists
  -h, --help           Show help
  --version            Print version

Examples:
  shotport browser https://example.com
  shotport browser https://example.com --element main --budget 900 --webp
  shotport app Calculator --window Calculator
  shotport desktop --region 0,0,1200,800 --json
`;
}
