import { BackendError, UsageError } from "./errors";
import { helpText, VERSION } from "./help";
import { parseArgv } from "./parse";
import { ProcessRunner } from "./runner";
import { captureAndroid, captureApp, captureBrowser, captureDesktop, captureIos, captureWindow } from "./backends";
import { runDoctor } from "./doctor";
import { formatResult } from "./output";
import type { Runner, ShotResult } from "./types";

export async function main(argv: string[], runner: Runner = new ProcessRunner()): Promise<number> {
  try {
    const command = parseArgv(argv);
    if (command.kind === "help") {
      process.stdout.write(helpText());
      return 0;
    }
    if (command.kind === "version") {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (command.kind === "doctor") {
      return runDoctor(runner);
    }
    if (command.kind === "ocr") {
      if (command.boxes) {
        const { ocrBoxes } = await import("./text");
        const { boxes, notes } = await ocrBoxes(runner, command.path);
        process.stdout.write(JSON.stringify({ boxes, notes }) + "\n");
        return boxes.length ? 0 : 1;
      }
      const { ocrImage } = await import("./text");
      const block = await ocrImage(runner, command.path);
      if (command.global.json) {
        process.stdout.write(JSON.stringify({ text: block.text, source: block.source, notes: block.notes }) + "\n");
      } else {
        process.stdout.write(block.text + (block.text.endsWith("\n") ? "" : "\n"));
      }
      return block.text.trim() ? 0 : 1;
    }

    const result = await dispatch(command, runner);
    process.stdout.write(formatResult(result, command.global.json));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`shotport: ${error.message}\n\n${helpText()}`);
      return error.code;
    }
    if (error instanceof BackendError) {
      process.stderr.write(`shotport: ${error.message}\n`);
      return error.code;
    }
    process.stderr.write(`shotport: unexpected failure: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

type RunnableCommand = Exclude<ReturnType<typeof parseArgv>, { kind: "help" | "version" | "doctor" | "ocr" }>;

async function dispatch(command: RunnableCommand, runner: Runner): Promise<ShotResult> {
  if (command.kind === "browser") return captureBrowser(runner, command.options, command.global);
  if (command.kind === "app") return captureApp(runner, command.options, command.global);
  if (command.kind === "window") return captureWindow(runner, command.options, command.global);
  if (command.kind === "desktop") return captureDesktop(runner, command.options, command.global);
  if (command.kind === "ios") return captureIos(runner, command.global);
  return captureAndroid(runner, command.global);
}
