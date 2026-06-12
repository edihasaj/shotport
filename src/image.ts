import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { GlobalOptions, ImageInfo, OutputFormat, Runner } from "./types";
import { BackendError } from "./errors";

export function estimateImageTokens(width: number, height: number): number {
  return Math.max(1, Math.ceil((width * height) / 750));
}

export function pickMaxEdge(width: number, height: number, maxPx: number, budget?: number): number {
  const capped = Math.min(Math.max(width, height), maxPx);
  if (!budget) return capped;
  const scale = Math.sqrt((budget * 750) / (width * height));
  const budgeted = Math.floor(Math.max(width, height) * Math.min(1, scale));
  return Math.max(64, Math.min(capped, budgeted));
}

export async function budgetImage(runner: Runner, sourcePath: string, global: GlobalOptions): Promise<ImageInfo> {
  const notes: string[] = [];
  const original = await readImageSize(runner, sourcePath);
  const maxEdge = pickMaxEdge(original.width, original.height, global.maxPx, global.budget);
  const output = global.out ?? (await tempImagePath(global.format));
  await mkdir(dirname(output), { recursive: true });
  await copyFile(sourcePath, output);

  if (maxEdge < Math.max(original.width, original.height)) {
    await requireOk(runner, ["sips", "-Z", String(maxEdge), output], "sips resize");
  }

  let finalPath = output;
  if (global.format === "jpeg") {
    await requireOk(runner, ["sips", "-s", "format", "jpeg", output, "--out", output], "sips jpeg conversion");
  } else if (global.format === "webp") {
    if (await runner.exists("cwebp")) {
      const webpPath = withExt(output, "webp");
      await requireOk(runner, ["cwebp", "-quiet", output, "-o", webpPath], "cwebp conversion");
      if (webpPath !== output) {
        await rm(output, { force: true });
        finalPath = webpPath;
      }
    } else {
      notes.push("cwebp not installed; kept PNG");
    }
  }

  const size = await readImageSize(runner, finalPath);
  return {
    path: finalPath,
    width: size.width,
    height: size.height,
    format: global.format,
    tokens: estimateImageTokens(size.width, size.height),
    notes,
  };
}

export async function readImageSize(runner: Runner, path: string): Promise<{ width: number; height: number }> {
  const result = await runner.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path]);
  if (result.code !== 0) throw new BackendError(`sips failed to read image size: ${result.stderr.trim()}`);
  const width = Number(result.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(result.stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!width || !height) throw new BackendError(`could not parse image dimensions for ${path}`);
  return { width, height };
}

async function tempImagePath(format: OutputFormat): Promise<string> {
  const dir = await mkdtemp(join("/private/tmp", "shotport-"));
  return join(dir, `capture.${format === "jpeg" ? "jpg" : format}`);
}

function withExt(path: string, ext: string): string {
  const current = extname(path);
  if (!current) return `${path}.${ext}`;
  return `${path.slice(0, -current.length)}.${ext}`;
}

async function requireOk(runner: Runner, args: string[], label: string): Promise<void> {
  const result = await runner.run(args);
  if (result.code !== 0) throw new BackendError(`${label} failed: ${result.stderr.trim() || result.stdout.trim()}`);
}
