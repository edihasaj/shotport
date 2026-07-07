import { UsageError } from "./errors";
import type { Command, GlobalOptions, OutputFormat } from "./types";

const DEFAULT_MAX_PX = 1280;
const DEFAULT_MAX_CHARS = 6000;
const FULL_TEXT_MAX_CHARS = Number.MAX_SAFE_INTEGER;

export function parseArgv(argv: string[]): Command {
  const global: GlobalOptions = {
    json: false,
    textOnly: false,
    imageOnly: false,
    maxPx: DEFAULT_MAX_PX,
    maxChars: DEFAULT_MAX_CHARS,
    format: "png",
    help: false,
    version: false,
  };

  const rest: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "-h" || arg === "--help") global.help = true;
    else if (arg === "--version") global.version = true;
    else if (arg === "--json") global.json = true;
    else if (arg === "--text-only") global.textOnly = true;
    else if (arg === "--image-only") global.imageOnly = true;
    else if (arg === "--jpeg") global.format = "jpeg";
    else if (arg === "--webp") global.format = "webp";
    else if (arg === "--out") global.out = takeValue(argv, ++index, "--out");
    else if (arg === "--budget") global.budget = parsePositiveInt(takeValue(argv, ++index, "--budget"), "--budget");
    else if (arg === "--max-px") global.maxPx = parsePositiveInt(takeValue(argv, ++index, "--max-px"), "--max-px");
    else if (arg === "--max-chars") global.maxChars = parsePositiveInt(takeValue(argv, ++index, "--max-chars"), "--max-chars");
    else if (arg === "--full-text") global.maxChars = FULL_TEXT_MAX_CHARS;
    else rest.push(arg);
  }

  if (global.textOnly && global.imageOnly) throw new UsageError("--text-only and --image-only cannot be used together");
  if (global.help) return { kind: "help", topic: rest[0] };
  if (global.version) return { kind: "version" };

  const subcommand = rest.shift();
  if (!subcommand) throw new UsageError("missing subcommand");

  if (subcommand === "browser") {
    const url = rest.shift();
    if (!url) throw new UsageError("browser requires <url|->");
    let live = false;
    const liveIdx = rest.indexOf("--live");
    if (liveIdx !== -1) {
      live = true;
      rest.splice(liveIdx, 1);
    }
    const { element, clip } = parseNamed(rest, ["--element", "--clip"]);
    ensureNoExtra(rest);
    return { kind: "browser", global, options: { url, element, clip, live } };
  }

  if (subcommand === "app") {
    const name = rest.shift();
    if (!name) throw new UsageError("app requires <name>");
    const named = parseNamed(rest, ["--window", "--region"]);
    ensureNoExtra(rest);
    return { kind: "app", global, options: { name, window: named.window, region: named.region } };
  }

  if (subcommand === "window") {
    const named = parseNamed(rest, ["--window", "--region"]);
    ensureNoExtra(rest);
    return { kind: "window", global, options: { window: named.window, region: named.region } };
  }

  if (subcommand === "desktop") {
    const named = parseNamed(rest, ["--region"]);
    ensureNoExtra(rest);
    return { kind: "desktop", global, options: { region: named.region } };
  }

  if (subcommand === "ios") return { kind: "ios", global };
  if (subcommand === "android") return { kind: "android", global };

  throw new UsageError(`unknown subcommand: ${subcommand}`);
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new UsageError(`${flag} requires a value`);
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new UsageError(`${flag} must be a positive integer`);
  return parsed;
}

function parseNamed(rest: string[], allowed: string[]): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (!allowed.includes(arg)) continue;
    const value = takeValue(rest, index + 1, arg);
    result[toKey(arg)] = value;
    rest.splice(index, 2);
    index -= 1;
  }
  return result;
}

function toKey(flag: string): string {
  return flag.replace(/^--/, "").replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function ensureNoExtra(rest: string[]): void {
  if (rest.length > 0) throw new UsageError(`unexpected argument: ${rest[0]}`);
}

export function assertFormat(format: string): asserts format is OutputFormat {
  if (!["png", "jpeg", "webp"].includes(format)) throw new UsageError(`unsupported format: ${format}`);
}
