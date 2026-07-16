import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { captureAndroid, captureApp, captureBrowser, captureDesktop, captureIos, captureWindow } from "../src/backends";
import type { GlobalOptions } from "../src/types";
import { MockRunner } from "./mockRunner";

const global: GlobalOptions = {
  json: false,
  textOnly: false,
  imageOnly: false,
  maxPx: 1280,
  maxChars: 6000,
  format: "png",
  help: false,
  version: false,
};

describe("backends", () => {
  test("browser uses abx navigation, accessibility, screenshot, and budgeting", async () => {
    const runner = new MockRunner(["abx", "sips"]);
    runner.on((args) => args[0] === "abx" && args[1] === "accessibility", { stdout: "Example Domain" });
    runner.on((args) => args[0] === "sips" && args.includes("pixelWidth"), {
      stdout: "  pixelWidth: 1400\n  pixelHeight: 900\n",
    });
    runner.on((args) => args[0] === "abx" && args[1] === "screenshot", async (args) => {
      await writeFile(args.at(-1)!, "");
      return {};
    });
    const result = await captureBrowser(runner, { url: "https://example.com", element: "main", clip: "0,0,300,200" }, global);
    expect(result.text?.text).toBe("Example Domain");
    expect(runner.calls.map((call) => call.args.slice(0, 3))).toContainEqual(["abx", "goto", "https://example.com"]);
    expect(runner.calls.some((call) => call.args.join(" ").includes("screenshot --clip 0,0,300,200 main"))).toBe(true);
    expect(result.image?.tokens).toBeGreaterThan(0);
    // Capture must write under the OS temp dir, not a hardcoded macOS path,
    // so it works on Linux CI too.
    expect(result.image?.path.startsWith(tmpdir())).toBe(true);
  });

  test("desktop falls back to screencapture when guiport is absent", async () => {
    const runner = new MockRunner(["sips", "swift"]);
    runner.on((args) => args[0] === "sips" && args.includes("pixelWidth"), {
      stdout: "  pixelWidth: 800\n  pixelHeight: 600\n",
    });
    runner.on((args) => args[0] === "screencapture", async (args) => {
      await writeFile(args.at(-1)!, "");
      return {};
    });
    const result = await captureDesktop(runner, { region: "0,0,100,100" }, global);
    expect(runner.calls.some((call) => call.args[0] === "screencapture")).toBe(true);
    expect(result.target).toBe("desktop");
  });

  test("desktop reports permission-denied image capture without losing a11y text", async () => {
    const runner = new MockRunner(["guiport", "sips"]);
    runner.on((args) => args[0] === "guiport" && args[1] === "tree", {
      stdout: JSON.stringify({ name: "System Settings", children: [{ name: "Screen Recording" }] }),
    });
    runner.on((args) => args[0] === "guiport" && args[1] === "screenshot", {
      code: 1,
      stderr: "screen_recording_not_granted",
    });
    runner.on((args) => args[0] === "screencapture", {
      code: 1,
      stderr: "could not create image from display",
    });
    const result = await captureDesktop(runner, {}, global);
    expect(result.image).toBeUndefined();
    expect(result.text?.text).toContain("Screen Recording");
    expect(result.notes.join("\n")).toContain("image capture skipped");
  });

  test("app reports permission-denied image capture while keeping guiport tree text", async () => {
    const runner = new MockRunner(["guiport", "sips"]);
    runner.on((args) => args[0] === "guiport" && args[1] === "tree", {
      stdout: JSON.stringify({ name: "Calculator", children: [{ name: "Equals" }] }),
    });
    runner.on((args) => args[0] === "guiport" && args[1] === "screenshot", {
      code: 1,
      stderr: "screen_recording_not_granted",
    });
    const result = await captureApp(runner, { name: "Calculator" }, global);
    expect(result.image).toBeUndefined();
    expect(result.text?.text).toContain("Equals");
    expect(result.notes.join("\n")).toContain("screen_recording_not_granted");
  });

  test("window resolves the frontmost app and dumps its full window text", async () => {
    const runner = new MockRunner(["guiport", "sips"]);
    runner.on((args) => args[0] === "guiport" && args[1] === "apps", {
      stdout: JSON.stringify([
        { name: "Finder", active: false, windowCount: 1 },
        { name: "Notes", active: true, windowCount: 2 },
        { name: "Spotlight", active: true, windowCount: 0 },
      ]),
    });
    runner.on((args) => args[0] === "guiport" && args[1] === "tree", {
      stdout: JSON.stringify({ name: "Notes", children: [{ name: "Grocery list" }] }),
    });
    runner.on((args) => args[0] === "guiport" && args[1] === "screenshot", async (args) => {
      await writeFile(args.at(-1)!, "");
      return {};
    });
    runner.on((args) => args[0] === "sips" && args.includes("pixelWidth"), {
      stdout: "  pixelWidth: 800\n  pixelHeight: 600\n",
    });
    const result = await captureWindow(runner, {}, global);
    // Picks the active app that actually owns a window, not the windowless one.
    expect(result.target).toBe("window Notes");
    expect(runner.calls.some((call) => call.args.join(" ").includes("guiport tree --app Notes"))).toBe(true);
    expect(result.text?.text).toContain("Grocery list");
  });

  test("window falls back to desktop capture when guiport is absent", async () => {
    const result = await captureWindow(new MockRunner([]), {}, global);
    expect(result.target).toContain("desktop");
    expect(result.notes.join("\n")).toContain("no guiport");
  });

  test("--full-text keeps text past the default cap", async () => {
    const runner = new MockRunner(["guiport"]);
    const long = Array.from({ length: 400 }, (_, i) => `row-${i}-scrolled-out-of-view`).join(" ");
    runner.on((args) => args[0] === "guiport" && args[1] === "tree", {
      stdout: JSON.stringify({ name: "Doc", value: long }),
    });
    const full = await captureApp(runner, { name: "Doc" }, { ...global, textOnly: true, maxChars: Number.MAX_SAFE_INTEGER });
    const capped = await captureApp(runner, { name: "Doc" }, { ...global, textOnly: true, maxChars: 200 });
    expect(full.text!.text.length).toBeGreaterThan(capped.text!.text.length);
    expect(capped.text!.text.length).toBeLessThanOrEqual(204); // 200 + "\n..."
  });

  test("ios reports no booted simulator without crashing", async () => {
    const runner = new MockRunner(["xcrun"]);
    runner.on((args) => args[0] === "xcrun", { code: 1, stderr: "No devices are booted." });
    const result = await captureIos(runner, global);
    expect(result.image).toBeUndefined();
    expect(result.notes[0]).toContain("No devices are booted");
  });

  test("android reports missing adb without crashing", async () => {
    const runner = new MockRunner([]);
    const result = await captureAndroid(runner, global);
    expect(result.notes[0]).toContain("adb not installed");
  });
});
