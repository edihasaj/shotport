import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import type { AppOptions, BrowserOptions, DesktopOptions, GlobalOptions, Runner, ShotResult, TextBlock } from "./types";
import { BackendError } from "./errors";
import { budgetImage } from "./image";
import { compactText, jsonToText, ocrImage } from "./text";

export async function captureBrowser(runner: Runner, options: BrowserOptions, global: GlobalOptions): Promise<ShotResult> {
  const notes: string[] = [];
  if (!(await runner.exists("abx"))) return missing("browser", "abx");
  const url = options.url === "-" ? compactText(await Bun.stdin.text(), 1000) : options.url;
  await requireOk(runner, ["abx", "goto", url], "abx goto");
  await requireOk(runner, ["abx", "wait", "--networkidle"], "abx wait --networkidle");

  let text: TextBlock | undefined;
  if (!global.imageOnly) {
    const a11y = await runner.run(["abx", "accessibility"]);
    if (a11y.code === 0) text = { source: "a11y", text: compactText(a11y.stdout), notes: [] };
    else text = { source: "none", text: "", notes: [`abx accessibility failed: ${a11y.stderr.trim() || a11y.stdout.trim()}`] };
  }

  const image = await maybeImage(runner, global, async (rawPath) => {
    const args = ["abx", "screenshot"];
    if (options.clip) args.push("--clip", options.clip);
    if (options.element) args.push(options.element);
    args.push(rawPath);
    await requireOk(runner, args, "abx screenshot");
  });

  return { target: `browser ${url}`, image, text, notes };
}

export async function captureApp(runner: Runner, options: AppOptions, global: GlobalOptions): Promise<ShotResult> {
  if (!(await runner.exists("guiport"))) return missing(`app ${options.name}`, "guiport");
  const notes: string[] = [];
  let text: TextBlock | undefined;
  if (!global.imageOnly) {
    const args = ["guiport", "tree", "--app", options.name];
    if (options.window) args.push("--window", options.window);
    const tree = await runner.run(args);
    if (tree.code === 0) {
      text = parseStructuredText("a11y", tree.stdout);
    } else {
      const observeArgs = ["guiport", "observe", "--app", options.name];
      if (options.window) observeArgs.push("--window", options.window);
      const observed = await runner.run(observeArgs);
      text = observed.code === 0
        ? { source: "observe", text: compactText(observed.stdout), notes: [`guiport tree failed: ${tree.stderr.trim() || tree.stdout.trim()}`] }
        : { source: "none", text: "", notes: [`guiport tree failed: ${tree.stderr.trim() || tree.stdout.trim()}`, `guiport observe failed: ${observed.stderr.trim() || observed.stdout.trim()}`] };
    }
  }

  const image = await safeMaybeImage(runner, global, notes, async (rawPath) => {
    if (options.region) {
      await requireOk(runner, ["screencapture", "-x", "-R", options.region, rawPath], "screencapture region");
      notes.push("used screencapture for --region");
      return;
    }
    const args = ["guiport", "screenshot", "--app", options.name, "-o", rawPath];
    if (options.window) args.push("--window", options.window);
    await requireOk(runner, args, "guiport screenshot");
  });

  if (!global.imageOnly && text?.source === "none" && image) text = await ocrImage(runner, image.path);
  return { target: `app ${options.name}`, image, text, notes };
}

export async function captureDesktop(runner: Runner, options: DesktopOptions, global: GlobalOptions): Promise<ShotResult> {
  const notes: string[] = [];
  let imagePathForOcr: string | undefined;
  const image = await safeMaybeImage(runner, global, notes, async (rawPath) => {
    if (options.region) await requireOk(runner, ["screencapture", "-x", "-R", options.region, rawPath], "screencapture region");
    else if (await runner.exists("guiport")) {
      const guiport = await runner.run(["guiport", "screenshot", "-o", rawPath]);
      if (guiport.code !== 0) {
        notes.push(`guiport screenshot failed; used screencapture: ${guiport.stderr.trim() || guiport.stdout.trim()}`);
        await requireOk(runner, ["screencapture", "-x", rawPath], "screencapture");
      }
    } else await requireOk(runner, ["screencapture", "-x", rawPath], "screencapture");
    imagePathForOcr = rawPath;
  });

  let text: TextBlock | undefined;
  if (!global.imageOnly) {
    if (await runner.exists("guiport")) {
      const tree = await runner.run(["guiport", "tree"]);
      text = tree.code === 0 ? parseStructuredText("a11y", tree.stdout) : undefined;
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
  const rawPath = join(await mkdtemp(join("/private/tmp", "shotport-raw-")), "raw.png");
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

function parseStructuredText(source: "a11y" | "observe", stdout: string): TextBlock {
  try {
    return { source, text: jsonToText(JSON.parse(stdout)), notes: [] };
  } catch {
    return { source, text: compactText(stdout), notes: [] };
  }
}

function missing(target: string, tool: string): ShotResult {
  return { target, notes: [tool.includes("missing") || tool.includes("not installed") ? `${tool}; capture skipped` : `${tool} missing; capture skipped`] };
}

async function requireOk(runner: Runner, args: string[], label: string): Promise<void> {
  const result = await runner.run(args);
  if (result.code !== 0) throw new BackendError(`${label} failed: ${result.stderr.trim() || result.stdout.trim()}`);
}
