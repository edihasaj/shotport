export type TargetKind = "browser" | "app" | "desktop" | "ios" | "android";
export type OutputFormat = "png" | "jpeg" | "webp";

export interface GlobalOptions {
  json: boolean;
  textOnly: boolean;
  imageOnly: boolean;
  out?: string;
  budget?: number;
  maxPx: number;
  format: OutputFormat;
  help: boolean;
  version: boolean;
}

export interface BrowserOptions {
  url: string;
  element?: string;
  clip?: string;
}

export interface AppOptions {
  name: string;
  window?: string;
  region?: string;
}

export interface DesktopOptions {
  region?: string;
}

export type Command =
  | { kind: "help"; topic?: string }
  | { kind: "version" }
  | { kind: "browser"; global: GlobalOptions; options: BrowserOptions }
  | { kind: "app"; global: GlobalOptions; options: AppOptions }
  | { kind: "desktop"; global: GlobalOptions; options: DesktopOptions }
  | { kind: "ios"; global: GlobalOptions }
  | { kind: "android"; global: GlobalOptions };

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
