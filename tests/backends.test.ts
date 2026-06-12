import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { captureAndroid, captureBrowser, captureDesktop } from "../src/backends";
import type { GlobalOptions } from "../src/types";
import { MockRunner } from "./mockRunner";

const global: GlobalOptions = {
  json: false,
  textOnly: false,
  imageOnly: false,
  maxPx: 1280,
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

  test("android reports missing adb without crashing", async () => {
    const runner = new MockRunner([]);
    const result = await captureAndroid(runner, global);
    expect(result.notes[0]).toContain("adb not installed");
  });
});
