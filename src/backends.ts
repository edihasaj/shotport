import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppOptions, BrowserOptions, DesktopOptions, GlobalOptions, Runner, ShotResult, TextBlock, WindowOptions } from "./types";
import { BackendError } from "./errors";
import { budgetImage } from "./image";
import { capture } from "./platform";
import { compactText, jsonToText, ocrImage } from "./text";

export async function captureBrowser(runner: Runner, options: BrowserOptions, global: GlobalOptions): Promise<ShotResult> {
  const notes: string[] = [];
  if (!(await runner.exists("abx"))) return missing("browser", "abx");
  // With --live, attach to an already-open, authenticated Chrome (logged-in apps)
  // via `abx live <cmd>` — abx reads the CDP endpoint from ABX_LIVE_CDP_URL. Opt-in
  // (not env-auto) since that var is often left set. Live mode has a slightly
  // different command set (no `wait`; `snapshot` instead of `accessibility`).
  const live = options.live === true;
  const abx = (cmd: string, ...rest: string[]): string[] => (live ? ["abx", "live", cmd, ...rest] : ["abx", cmd, ...rest]);
  if (live) notes.push("live authenticated session (abx live)");
  const url = options.url === "-" ? compactText(await Bun.stdin.text(), 1000) : options.url;
  await requireOk(runner, abx("goto", url), "abx goto");
  // `wait` is default-mode only and best-effort; ignore if unsupported (live).
  await runner.run(abx("wait", "--networkidle"));

  let text: TextBlock | undefined;
  if (!global.imageOnly) {
    // Live mode has no `accessibility`; fall back to `snapshot` (also an a11y tree).
    let a11y = await runner.run(abx("accessibility"));
    if (a11y.code !== 0 && live) a11y = await runner.run(abx("snapshot"));
    if (a11y.code === 0) text = { source: "a11y", text: compactText(a11y.stdout, global.maxChars), notes: [] };
    else text = { source: "none", text: "", notes: [`abx a11y failed: ${a11y.stderr.trim() || a11y.stdout.trim()}`] };
  }

  const image = await maybeImage(runner, global, async (rawPath) => {
    const args = abx("screenshot");
    if (options.clip) args.push("--clip", options.clip);
    if (options.element) args.push(options.element);
    args.push(rawPath);
    await requireOk(runner, args, "abx screenshot");
  });

  return { target: `browser ${url}${live ? " (live)" : ""}`, image, text, notes };
}

export async function captureApp(runner: Runner, options: AppOptions, global: GlobalOptions): Promise<ShotResult> {
  const notes: string[] = [];
  let text: TextBlock | undefined;
  const hasGuiport = await runner.exists("guiport");

  // Text: the accessibility tree via guiport (macOS) when available; otherwise
  // we OCR the image below (cross-platform).
  if (!global.imageOnly && hasGuiport) {
    const args = ["guiport", "tree", "--app", options.name];
    if (options.window) args.push("--window", options.window);
    const tree = await runner.run(args);
    if (tree.code === 0) text = parseStructuredText("a11y", tree.stdout, global.maxChars);
  }

  // Image: platform capture — guiport (mac), PrintWindow (Windows), import (Linux).
  const image = await safeMaybeImage(runner, global, notes, async (rawPath) => {
    const note = options.region
      ? await capture(runner, { kind: "screen", region: options.region }, rawPath)
      : await capture(runner, { kind: "app", name: options.name }, rawPath);
    if (note) throw new BackendError(note);
  });

  if (!global.imageOnly && (!text || !text.text) && image) text = await ocrImage(runner, image.path);
  return { target: `app ${options.name}`, image, text, notes };
}

// Capture whatever window is frontmost right now — no app name needed.
// Resolves the active app via `guiport apps`, then runs the app flow, whose
// `guiport tree` dump includes window text scrolled out of view.
export async function captureWindow(runner: Runner, options: WindowOptions, global: GlobalOptions): Promise<ShotResult> {
  // macOS: resolve the frontmost app via guiport, then run the app flow (its
  // a11y tree includes text scrolled out of view).
  if (await runner.exists("guiport")) {
    const active = await runner.run(["guiport", "apps", "--json"]);
    if (active.code !== 0) {
      return { target: "window", notes: [`guiport apps failed: ${active.stderr.trim() || active.stdout.trim()}`] };
    }
    const name = frontmostApp(active.stdout);
    if (!name) return { target: "window", notes: ["no frontmost app with a window found"] };
    const result = await captureApp(runner, { name, window: options.window, region: options.region }, global);
    return { ...result, target: `window ${name}${options.window ? ` · ${options.window}` : ""}` };
  }
  // Windows/Linux without guiport: capture the desktop (frontmost-window
  // capture would need a platform helper; the desktop still gives usable OCR).
  const result = await captureDesktop(runner, { region: options.region }, global);
  return { ...result, target: "window (desktop fallback)", notes: [...result.notes, "no guiport; captured desktop"] };
}

function frontmostApp(stdout: string): string | undefined {
  let apps: Array<{ name?: string; active?: boolean; windowCount?: number }>;
  try {
    apps = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(apps)) return undefined;
  const active = apps.filter((app) => app.active && app.name);
  // Prefer the active app that actually owns a window; fall back to any active app.
  return (active.find((app) => (app.windowCount ?? 0) > 0) ?? active[0])?.name;
}

export async function captureDesktop(runner: Runner, options: DesktopOptions, global: GlobalOptions): Promise<ShotResult> {
  const notes: string[] = [];
  let imagePathForOcr: string | undefined;
  const image = await safeMaybeImage(runner, global, notes, async (rawPath) => {
    const note = await capture(runner, { kind: "screen", region: options.region }, rawPath);
    if (note) throw new BackendError(note);
    imagePathForOcr = rawPath;
  });

  let text: TextBlock | undefined;
  if (!global.imageOnly) {
    if (await runner.exists("guiport")) {
      const tree = await runner.run(["guiport", "tree"]);
      text = tree.code === 0 ? parseStructuredText("a11y", tree.stdout, global.maxChars) : undefined;
      if (!text?.text) notes.push("guiport tree unavailable; using OCR");
    }
    const ocrPath = image?.path ?? imagePathForOcr;
    if ((!text || !text.text) && ocrPath) text = await ocrImage(runner, ocrPath);
  }

  return { target: "desktop", image, text, notes };
}

export async function captureIos(runner: Runner, global: GlobalOptions): Promise<ShotResult> {
  if (!(await runner.exists("xcrun"))) return missing("ios", "xcrun");
  const notes: string[] = [];
  const image = await safeMaybeImage(runner, global, notes, async (rawPath) => {
    await requireOk(runner, ["xcrun", "simctl", "io", "booted", "screenshot", rawPath], "xcrun simctl screenshot");
  });
  const text = !global.imageOnly && image ? await ocrImage(runner, image.path) : undefined;
  return { target: "ios booted simulator", image, text, notes };
}

export async function captureAndroid(runner: Runner, global: GlobalOptions): Promise<ShotResult> {
  if (!(await runner.exists("adb"))) return missing("android", "adb not installed");
  const image = await maybeImage(runner, global, async (rawPath) => {
    await requireOk(runner, ["/usr/bin/env", "bash", "-lc", `adb exec-out screencap -p > ${JSON.stringify(rawPath)}`], "adb screencap");
  });
  const text = !global.imageOnly && image ? await ocrImage(runner, image.path) : undefined;
  return { target: "android device", image, text, notes: [] };
}

async function maybeImage(runner: Runner, global: GlobalOptions, capture: (rawPath: string) => Promise<void>) {
  if (global.textOnly) return undefined;
  const rawPath = join(await mkdtemp(join(tmpdir(), "shotport-raw-")), "raw.png");
  await capture(rawPath);
  return budgetImage(runner, rawPath, global);
}

async function safeMaybeImage(runner: Runner, global: GlobalOptions, notes: string[], capture: (rawPath: string) => Promise<void>) {
  try {
    return await maybeImage(runner, global, capture);
  } catch (error) {
    notes.push(`image capture skipped: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function parseStructuredText(source: "a11y" | "observe", stdout: string, maxChars: number): TextBlock {
  try {
    return { source, text: jsonToText(JSON.parse(stdout), maxChars), notes: [] };
  } catch {
    return { source, text: compactText(stdout, maxChars), notes: [] };
  }
}

function missing(target: string, tool: string): ShotResult {
  return { target, notes: [tool.includes("missing") || tool.includes("not installed") ? `${tool}; capture skipped` : `${tool} missing; capture skipped`] };
}

async function requireOk(runner: Runner, args: string[], label: string): Promise<void> {
  const result = await runner.run(args);
  if (result.code !== 0) throw new BackendError(`${label} failed: ${result.stderr.trim() || result.stdout.trim()}`);
}
