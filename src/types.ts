export type TargetKind = "browser" | "app" | "desktop" | "ios" | "android";
export type OutputFormat = "png" | "jpeg" | "webp";

export interface GlobalOptions {
  json: boolean;
  textOnly: boolean;
  imageOnly: boolean;
  out?: string;
  budget?: number;
  maxPx: number;
  maxChars: number;
  format: OutputFormat;
  help: boolean;
  version: boolean;
}

export interface BrowserOptions {
  url: string;
  element?: string;
  clip?: string;
  // Capture through an already-open, authenticated Chrome via `abx live` (CDP).
  // Opt-in with --live; abx reads the endpoint from ABX_LIVE_CDP_URL.
  live?: boolean;
}

export interface AppOptions {
  name: string;
  window?: string;
  region?: string;
}

export interface DesktopOptions {
  region?: string;
}

export interface WindowOptions {
  window?: string;
  region?: string;
}

export type Command =
  | { kind: "help"; topic?: string }
  | { kind: "version" }
  | { kind: "browser"; global: GlobalOptions; options: BrowserOptions }
  | { kind: "app"; global: GlobalOptions; options: AppOptions }
  | { kind: "window"; global: GlobalOptions; options: WindowOptions }
  | { kind: "desktop"; global: GlobalOptions; options: DesktopOptions }
  | { kind: "ios"; global: GlobalOptions }
  | { kind: "android"; global: GlobalOptions }
  | { kind: "doctor" }
  | { kind: "ocr"; path: string; global: GlobalOptions };

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Runner {
  run(args: string[], input?: string): Promise<RunResult>;
  exists(command: string): Promise<boolean>;
}

export interface TextBlock {
  source: "a11y" | "observe" | "ocr" | "none";
  text: string;
  notes: string[];
}

export interface ImageInfo {
  path: string;
  width: number;
  height: number;
  format: OutputFormat;
  tokens: number;
  notes: string[];
}

export interface ShotResult {
  target: string;
  image?: ImageInfo;
  text?: TextBlock;
  notes: string[];
}
