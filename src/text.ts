import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Runner, TextBox, TextBlock } from "./types";

export async function ocrImage(runner: Runner, imagePath: string): Promise<TextBlock> {
  const notes: string[] = [];

  // macOS: Apple Vision. Windows: built-in Windows.Media.Ocr (no install needed).
  const native = process.platform === "win32"
    ? await windowsOcr(runner, imagePath)
    : await visionOcr(runner, imagePath);
  if (native.text.trim()) return { source: "ocr", text: compactText(native.text), notes: native.notes };
  notes.push(...native.notes);

  if (await runner.exists("tesseract")) {
    const tess = await runner.run(["tesseract", imagePath, "stdout"]);
    if (tess.code === 0 && tess.stdout.trim()) return { source: "ocr", text: compactText(tess.stdout), notes };
    notes.push(`tesseract failed or found no text${tess.stderr.trim() ? `: ${tess.stderr.trim()}` : ""}`);
  } else {
    notes.push("tesseract not installed");
  }

  return { source: "none", text: "", notes };
}

// OCR an image and return per-line bounding boxes (image pixels, top-left
// origin) so callers can *locate* text, not just read it — the "find text
// position / click it" primitive. macOS: Apple Vision. Windows: WinRT OCR.
// Linux: tesseract TSV.
export async function ocrBoxes(runner: Runner, imagePath: string): Promise<{ boxes: TextBox[]; notes: string[] }> {
  const platform = runner.platform ?? process.platform;
  if (platform === "win32") return windowsOcrBoxes(runner, imagePath);
  if (platform === "darwin") return visionOcrBoxes(runner, imagePath);
  return tesseractBoxes(runner, imagePath);
}

// Parse "x\ty\tw\th\ttext" lines (the shared format the Vision/WinRT scripts
// emit) into TextBoxes.
export function parseBoxLines(stdout: string): TextBox[] {
  const boxes: TextBox[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 5) continue;
    const [x, y, w, h] = parts.slice(0, 4).map(Number);
    const text = parts.slice(4).join("\t").trim();
    if (!text || [x, y, w, h].some((n) => !Number.isFinite(n))) continue;
    boxes.push({ text, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }
  return boxes;
}

async function visionOcrBoxes(runner: Runner, imagePath: string): Promise<{ boxes: TextBox[]; notes: string[] }> {
  if (!(await runner.exists("swift"))) return { boxes: [], notes: ["swift not installed; skipped Apple Vision OCR"] };
  const dir = await mkdtemp(join(tmpdir(), "shotport-vbox-"));
  const script = join(dir, "boxes.swift");
  await writeFile(script, VISION_BOXES_SWIFT, "utf8");
  const result = await runner.run(["swift", script, imagePath]);
  if (result.code !== 0) return { boxes: [], notes: [`Apple Vision OCR failed: ${result.stderr.trim() || result.stdout.trim()}`] };
  return { boxes: parseBoxLines(result.stdout), notes: [] };
}

async function windowsOcrBoxes(runner: Runner, imagePath: string): Promise<{ boxes: TextBox[]; notes: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), "shotport-wbox-"));
  const script = join(dir, "boxes.ps1");
  await writeFile(script, WIN_OCR_BOXES_PS1, "utf8");
  const result = await runner.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Path", imagePath]);
  if (result.code !== 0) return { boxes: [], notes: [`Windows OCR failed: ${result.stderr.trim() || result.stdout.trim()}`] };
  return { boxes: parseBoxLines(result.stdout), notes: [] };
}

// tesseract TSV: per-word rows (level 5) with left/top/width/height; aggregate
// words into lines by (block, paragraph, line) index.
async function tesseractBoxes(runner: Runner, imagePath: string): Promise<{ boxes: TextBox[]; notes: string[] }> {
  if (!(await runner.exists("tesseract"))) return { boxes: [], notes: ["tesseract not installed"] };
  const result = await runner.run(["tesseract", imagePath, "stdout", "tsv"]);
  if (result.code !== 0) return { boxes: [], notes: [`tesseract failed${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`] };
  const rows = result.stdout.split(/\r?\n/);
  const header = rows.shift()?.split("\t") ?? [];
  const col = (name: string) => header.indexOf(name);
  const [ci, cb, cp, cl, cx, cy, cw, ch, ct] = ["conf", "block_num", "par_num", "line_num", "left", "top", "width", "height", "text"].map(col);
  const lines = new Map<string, { x0: number; y0: number; x1: number; y1: number; words: string[] }>();
  for (const row of rows) {
    const f = row.split("\t");
    if (f.length <= ct) continue;
    const text = (f[ct] ?? "").trim();
    const conf = Number(f[ci]);
    if (!text || !(conf >= 0)) continue; // level-<5 rows have conf -1 and empty text
    const key = `${f[cb]}/${f[cp]}/${f[cl]}`;
    const x = Number(f[cx]), y = Number(f[cy]), w = Number(f[cw]), h = Number(f[ch]);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    const line = lines.get(key) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, words: [] };
    line.x0 = Math.min(line.x0, x);
    line.y0 = Math.min(line.y0, y);
    line.x1 = Math.max(line.x1, x + w);
    line.y1 = Math.max(line.y1, y + h);
    line.words.push(text);
    lines.set(key, line);
  }
  const boxes: TextBox[] = [];
  for (const l of lines.values()) {
    boxes.push({ text: l.words.join(" "), x: Math.round(l.x0), y: Math.round(l.y0), w: Math.round(l.x1 - l.x0), h: Math.round(l.y1 - l.y0) });
  }
  return { boxes, notes: [] };
}

export function compactText(text: string, maxChars = 6000): string {
  const compacted = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  return compacted.length > maxChars ? `${compacted.slice(0, maxChars)}\n...` : compacted;
}

export function jsonToText(value: unknown, maxChars = 6000): string {
  const parts: string[] = [];
  walk(value, parts);
  return compactText([...new Set(parts)].join("\n"), maxChars);
}

async function visionOcr(runner: Runner, imagePath: string): Promise<{ text: string; notes: string[] }> {
  if (!(await runner.exists("swift"))) return { text: "", notes: ["swift not installed; skipped Apple Vision OCR"] };
  const dir = await mkdtemp(join(tmpdir(), "shotport-vision-"));
  const script = join(dir, "vision.swift");
  await writeFile(script, VISION_SWIFT, "utf8");
  const result = await runner.run(["swift", script, imagePath]);
  if (result.code !== 0) return { text: "", notes: [`Apple Vision OCR failed: ${result.stderr.trim() || result.stdout.trim()}`] };
  return { text: result.stdout, notes: [] };
}

// Windows: OCR via the built-in Windows.Media.Ocr WinRT engine (no install).
async function windowsOcr(runner: Runner, imagePath: string): Promise<{ text: string; notes: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), "shotport-winocr-"));
  const script = join(dir, "ocr.ps1");
  await writeFile(script, WIN_OCR_PS1, "utf8");
  const result = await runner.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Path", imagePath]);
  if (result.code !== 0) return { text: "", notes: [`Windows OCR failed: ${result.stderr.trim() || result.stdout.trim()}`] };
  return { text: result.stdout, notes: [] };
}

const WIN_OCR_PS1 = `param([string]$Path)
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}
[Windows.Storage.StorageFile,           Windows.Storage,                ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,       ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,           Windows.Media.Ocr,              ContentType=WindowsRuntime] | Out-Null
$file    = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream  = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap  = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine  = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { Write-Error 'no OCR language installed'; exit 1 }
$res = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$res.Lines | ForEach-Object { $_.Text }
`;

function walk(value: unknown, parts: string[]): void {
  if (typeof value === "string") {
    if (value.trim()) parts.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, parts);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["name", "title", "text", "value", "description", "role", "summary"]) {
      walk(record[key], parts);
    }
    for (const child of Object.values(record)) walk(child, parts);
  }
}

const VISION_SWIFT = String.raw`import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count == 2 else {
  FileHandle.standardError.write(Data("usage: vision.swift <image>\n".utf8))
  exit(2)
}

let url = URL(fileURLWithPath: args[1])
guard let image = NSImage(contentsOf: url), let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write(Data("could not load image\n".utf8))
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage)
try handler.perform([request])

let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
`;

// Windows: WinRT OCR emitting one "x<TAB>y<TAB>w<TAB>h<TAB>text" line per OCR
// line (boxes in image pixels). Uses [char]9 for the tab to avoid backticks.
const WIN_OCR_BOXES_PS1 = `param([string]$Path)
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[Windows.Storage.StorageFile,           Windows.Storage,                ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,       ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,           Windows.Media.Ocr,              ContentType=WindowsRuntime] | Out-Null
$file    = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream  = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap  = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine  = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { Write-Error 'no OCR language installed'; exit 1 }
$res = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$tab = [char]9
foreach ($line in $res.Lines) {
  $ws = $line.Words; if ($ws.Count -eq 0) { continue }
  $minX = ($ws | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
  $minY = ($ws | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
  $maxX = ($ws | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
  $maxY = ($ws | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
  @([int]$minX, [int]$minY, [int]($maxX-$minX), [int]($maxY-$minY), $line.Text) -join $tab
}
`;

// macOS: Apple Vision emitting the same "x<TAB>y<TAB>w<TAB>h<TAB>text" lines.
// Vision's boundingBox is normalised with a bottom-left origin, so we scale by
// the image size and flip Y to a top-left pixel origin.
const VISION_BOXES_SWIFT = String.raw`import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count == 2 else { FileHandle.standardError.write(Data("usage: boxes.swift <image>\n".utf8)); exit(2) }
let url = URL(fileURLWithPath: args[1])
guard let image = NSImage(contentsOf: url), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write(Data("could not load image\n".utf8)); exit(1)
}
let W = Double(cg.width), H = Double(cg.height)
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
let handler = VNImageRequestHandler(cgImage: cg)
try handler.perform([request])
for obs in (request.results ?? []) {
  guard let cand = obs.topCandidates(1).first else { continue }
  let bb = obs.boundingBox
  let x = Int(bb.minX * W)
  let y = Int((1.0 - bb.maxY) * H)
  let w = Int(bb.width * W)
  let h = Int(bb.height * H)
  print("\(x)\t\(y)\t\(w)\t\(h)\t\(cand.string)")
}
`;
