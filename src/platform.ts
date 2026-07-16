// Cross-platform screenshot capture to a PNG file.
//
// macOS  — screencapture (region) or guiport (app/window), Apple Vision OCR.
// Windows — PowerShell + GDI (full screen) / PrintWindow (a window by title).
// Linux  — grim (wayland) / scrot / ImageMagick import (X11).
//
// Each returns "" on success or a note string on failure, so callers degrade
// gracefully (text-only still works).

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Runner } from "./types";

export type CaptureKind =
  | { kind: "screen"; region?: string }
  | { kind: "app"; name: string };

export async function capture(runner: Runner, target: CaptureKind, rawPath: string): Promise<string> {
  if (process.platform === "darwin") return captureMac(runner, target, rawPath);
  if (process.platform === "win32") return captureWindows(runner, target, rawPath);
  return captureLinux(runner, target, rawPath);
}

// ---------------------------------------------------------------- macOS -------
async function captureMac(runner: Runner, t: CaptureKind, rawPath: string): Promise<string> {
  if (t.kind === "screen") {
    if (t.region) return run(runner, ["screencapture", "-x", "-R", t.region, rawPath]);
    if (await runner.exists("guiport")) {
      const g = await runner.run(["guiport", "screenshot", "-o", rawPath]);
      if (g.code === 0) return "";
    }
    return run(runner, ["screencapture", "-x", rawPath]);
  }
  if (await runner.exists("guiport")) {
    const g = await runner.run(["guiport", "screenshot", "--app", t.name, "-o", rawPath]);
    if (g.code === 0) return "";
    return `guiport screenshot failed: ${g.stderr.trim() || g.stdout.trim()}`;
  }
  return "guiport not installed (needed for app capture on macOS)";
}

// -------------------------------------------------------------- Windows -------
async function captureWindows(runner: Runner, t: CaptureKind, rawPath: string): Promise<string> {
  const title = t.kind === "app" ? t.name : "";
  const script = t.kind === "app" ? WIN_WINDOW_PS1 : WIN_SCREEN_PS1;
  const dir = await mkdtemp(join(tmpdir(), "shotport-win-"));
  const ps1 = join(dir, "cap.ps1");
  await writeFile(ps1, script, "utf8");
  const args = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Path", rawPath];
  if (title) args.push("-Title", title);
  const r = await runner.run(args);
  return r.code === 0 ? "" : `windows capture failed: ${r.stderr.trim() || r.stdout.trim()}`;
}

// ---------------------------------------------------------------- Linux -------
async function captureLinux(runner: Runner, t: CaptureKind, rawPath: string): Promise<string> {
  // App/window capture: ImageMagick `import` by window name (X11).
  if (t.kind === "app") {
    if (await runner.exists("import"))
      return run(runner, ["import", "-window", t.name, rawPath]);
    return "install imagemagick (`import`) for app capture on Linux";
  }
  // Full screen: prefer wayland grim, then scrot, then import -window root.
  if (await runner.exists("grim")) return run(runner, ["grim", rawPath]);
  if (await runner.exists("scrot")) return run(runner, ["scrot", "-o", rawPath]);
  if (await runner.exists("import")) return run(runner, ["import", "-window", "root", rawPath]);
  return "install grim, scrot, or imagemagick for screen capture on Linux";
}

async function run(runner: Runner, args: string[]): Promise<string> {
  const r = await runner.run(args);
  return r.code === 0 ? "" : `${args[0]} failed: ${r.stderr.trim() || r.stdout.trim()}`;
}

// PowerShell: whole virtual screen via GDI CopyFromScreen.
const WIN_SCREEN_PS1 = `param([string]$Path)
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;

// PowerShell: find a top-level window whose title contains -Title, foreground it,
// then PrintWindow it to a bitmap (works for most apps incl. Chromium/WebView).
const WIN_WINDOW_PS1 = `param([string]$Path,[string]$Title)
Add-Type @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint f);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
}
"@ -ReferencedAssemblies System.Drawing
$p = Get-Process | Where-Object { $_.MainWindowTitle -like "*$Title*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Error "no window matching '$Title'"; exit 1 }
$h = $p.MainWindowHandle
[Win]::ShowWindow($h, 5) | Out-Null
[Win]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 300
$r = New-Object Win+RECT
[Win]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.R - $r.L; $ht = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[Win]::PrintWindow($h, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;
