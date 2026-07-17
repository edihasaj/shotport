import { copyFile, mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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

  // Resize / convert are best-effort: on a platform without the needed tool we
  // keep the full-size PNG and note it, rather than losing a good capture.
  if (maxEdge < Math.max(original.width, original.height)) {
    const err = await resizeImage(runner, output, maxEdge);
    if (err) notes.push(`resize skipped (${err}); kept full-size image`);
  }

  let finalPath = output;
  if (global.format === "jpeg") {
    const err = await convertJpeg(runner, output);
    if (err) notes.push(`jpeg conversion skipped (${err}); kept PNG`);
  } else if (global.format === "webp") {
    if (await runner.exists("cwebp")) {
      const webpPath = withExt(output, "webp");
      const r = await runner.run(["cwebp", "-quiet", output, "-o", webpPath]);
      if (r.code === 0 && webpPath !== output) {
        await rm(output, { force: true });
        finalPath = webpPath;
      } else if (r.code !== 0) {
        notes.push(`cwebp conversion skipped (${r.stderr.trim() || r.stdout.trim()}); kept PNG`);
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

// ------------------------------------------------------------- image size ----
// Dimensions via the platform's image tool, falling back to a dependency-free
// header parse so sizing works even when no image CLI is installed.
export async function readImageSize(runner: Runner, path: string): Promise<{ width: number; height: number }> {
  const platform = runner.platform ?? process.platform;
  if (platform === "darwin") {
    const s = await sipsSize(runner, path);
    if (s) return s;
  } else if (platform === "win32") {
    const s = await powershellSize(runner, path);
    if (s) return s;
  } else {
    const s = await identifySize(runner, path);
    if (s) return s;
  }
  const header = await headerSize(path);
  if (header) return header;
  throw new BackendError(`could not read image size for ${path}`);
}

async function sipsSize(runner: Runner, path: string): Promise<{ width: number; height: number } | undefined> {
  const result = await runner.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path]);
  if (result.code !== 0) return undefined;
  const width = Number(result.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(result.stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
  return width && height ? { width, height } : undefined;
}

async function identifySize(runner: Runner, path: string): Promise<{ width: number; height: number } | undefined> {
  if (!(await runner.exists("identify"))) return undefined;
  const result = await runner.run(["identify", "-format", "%w %h", path]);
  if (result.code !== 0) return undefined;
  const [w, h] = result.stdout.trim().split(/\s+/).map(Number);
  return w && h ? { width: w, height: h } : undefined;
}

async function powershellSize(runner: Runner, path: string): Promise<{ width: number; height: number } | undefined> {
  const script =
    `Add-Type -AssemblyName System.Drawing;` +
    `$i=[System.Drawing.Image]::FromFile('${path.replace(/'/g, "''")}');` +
    `Write-Output ("{0} {1}" -f $i.Width,$i.Height);$i.Dispose()`;
  const result = await runner.run(["powershell", "-NoProfile", "-Command", script]);
  if (result.code !== 0) return undefined;
  const [w, h] = result.stdout.trim().split(/\s+/).map(Number);
  return w && h ? { width: w, height: h } : undefined;
}

// Parse width/height straight from the file header — no external tool. Covers the
// formats shotport ever produces or consumes (PNG capture; JPEG after conversion).
async function headerSize(path: string): Promise<{ width: number; height: number } | undefined> {
  let fh;
  try {
    fh = await open(path, "r");
    const head = Buffer.alloc(32);
    const { bytesRead } = await fh.read(head, 0, 32, 0);
    if (bytesRead >= 24 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
    }
    if (bytesRead >= 10 && head.subarray(0, 3).toString("latin1") === "GIF") {
      return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
    }
    if (bytesRead >= 26 && head[0] === 0x42 && head[1] === 0x4d) {
      return { width: head.readInt32LE(18), height: Math.abs(head.readInt32LE(22)) };
    }
    if (bytesRead >= 2 && head[0] === 0xff && head[1] === 0xd8) {
      return await jpegHeaderSize(fh);
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    await fh?.close();
  }
}

// Walk JPEG segment markers to the first Start-Of-Frame and read its dimensions.
async function jpegHeaderSize(fh: Awaited<ReturnType<typeof open>>): Promise<{ width: number; height: number } | undefined> {
  let offset = 2;
  const seg = Buffer.alloc(8);
  for (;;) {
    const { bytesRead } = await fh.read(seg, 0, 4, offset);
    if (bytesRead < 4 || seg[0] !== 0xff) return undefined;
    const marker = seg[1];
    const length = seg.readUInt16BE(2);
    // SOF0..SOF15 (excluding 0xC4 DHT, 0xC8 JPG, 0xCC DAC) carry frame dimensions.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const dims = Buffer.alloc(5);
      await fh.read(dims, 0, 5, offset + 4);
      return { width: dims.readUInt16BE(3), height: dims.readUInt16BE(1) };
    }
    offset += 2 + length;
  }
}

// ---------------------------------------------------------------- resize -----
// Returns "" on success (or when no resize was needed), else a short reason.
async function resizeImage(runner: Runner, path: string, maxEdge: number): Promise<string> {
  const platform = runner.platform ?? process.platform;
  if (platform === "darwin") {
    const r = await runner.run(["sips", "-Z", String(maxEdge), path]);
    return r.code === 0 ? "" : r.stderr.trim() || r.stdout.trim() || "sips resize failed";
  }
  if (platform === "win32") return powershellResize(runner, path, maxEdge);
  // Linux: ImageMagick if present, else leave as-is.
  if (await runner.exists("convert")) {
    const r = await runner.run(["convert", path, "-resize", `${maxEdge}x${maxEdge}>`, path]);
    return r.code === 0 ? "" : r.stderr.trim() || "convert resize failed";
  }
  if (await runner.exists("magick")) {
    const r = await runner.run(["magick", path, "-resize", `${maxEdge}x${maxEdge}>`, path]);
    return r.code === 0 ? "" : r.stderr.trim() || "magick resize failed";
  }
  return "no imagemagick";
}

async function powershellResize(runner: Runner, path: string, maxEdge: number): Promise<string> {
  const p = path.replace(/'/g, "''");
  const script =
    `Add-Type -AssemblyName System.Drawing;` +
    `$src=[System.Drawing.Image]::FromFile('${p}');` +
    `$s=[Math]::Min(1.0,${maxEdge}/[Math]::Max($src.Width,$src.Height));` +
    `$w=[int]($src.Width*$s);$h=[int]($src.Height*$s);` +
    `$bmp=New-Object System.Drawing.Bitmap $w,$h;` +
    `$g=[System.Drawing.Graphics]::FromImage($bmp);` +
    `$g.InterpolationMode='HighQualityBicubic';` +
    `$g.DrawImage($src,0,0,$w,$h);$src.Dispose();` +
    `$bmp.Save('${p}',[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$bmp.Dispose()`;
  const r = await runner.run(["powershell", "-NoProfile", "-Command", script]);
  return r.code === 0 ? "" : r.stderr.trim() || r.stdout.trim() || "powershell resize failed";
}

// --------------------------------------------------------------- to jpeg -----
async function convertJpeg(runner: Runner, path: string): Promise<string> {
  const platform = runner.platform ?? process.platform;
  if (platform === "darwin") {
    const r = await runner.run(["sips", "-s", "format", "jpeg", path, "--out", path]);
    return r.code === 0 ? "" : r.stderr.trim() || "sips jpeg failed";
  }
  if (platform === "win32") {
    const p = path.replace(/'/g, "''");
    const script =
      `Add-Type -AssemblyName System.Drawing;` +
      `$i=[System.Drawing.Image]::FromFile('${p}');` +
      `$c=New-Object System.Drawing.Bitmap $i;$i.Dispose();` +
      `$c.Save('${p}',[System.Drawing.Imaging.ImageFormat]::Jpeg);$c.Dispose()`;
    const r = await runner.run(["powershell", "-NoProfile", "-Command", script]);
    return r.code === 0 ? "" : r.stderr.trim() || r.stdout.trim() || "powershell jpeg failed";
  }
  if (await runner.exists("convert")) {
    const r = await runner.run(["convert", path, `jpeg:${path}`]);
    return r.code === 0 ? "" : r.stderr.trim() || "convert jpeg failed";
  }
  return "no jpeg encoder";
}

async function tempImagePath(format: OutputFormat): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "shotport-"));
  return join(dir, `capture.${format === "jpeg" ? "jpg" : format}`);
}

function withExt(path: string, ext: string): string {
  const current = extname(path);
  if (!current) return `${path}.${ext}`;
  return `${path.slice(0, -current.length)}.${ext}`;
}
