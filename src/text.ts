import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Runner, TextBlock } from "./types";

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
