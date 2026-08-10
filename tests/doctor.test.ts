import { describe, expect, test } from "bun:test";
import { parseArgv } from "../src/parse";
import { runDoctor } from "../src/doctor";
import { MockRunner } from "./mockRunner";

describe("doctor", () => {
  test("parses the doctor subcommand", () => {
    expect(parseArgv(["doctor"]).kind).toBe("doctor");
  });

  test("rejects extra args", () => {
    expect(() => parseArgv(["doctor", "extra"])).toThrow();
  });

  test("delegates macOS permission setup to guiport", async () => {
    const runner = new MockRunner(["guiport"]);
    runner.on((args) => args.join(" ") === "guiport doctor --fix", {
      code: 1,
      stdout: "guiport 0.1.63 (macOS)\nNOT READY",
    });
    const code = await runDoctor(runner);
    expect(code).toBe(1);
    expect(runner.calls).toEqual([{ args: ["guiport", "doctor", "--fix"], input: undefined }]);
  });

  test("fails clearly when guiport is missing on macOS", async () => {
    const runner = new MockRunner();
    expect(await runDoctor(runner)).toBe(1);
    expect(runner.calls).toEqual([]);
  });

  test("needs no permission setup off macOS", async () => {
    const runner = new MockRunner();
    runner.platform = "linux";
    expect(await runDoctor(runner)).toBe(0);
    expect(runner.calls).toEqual([]);
  });
});
