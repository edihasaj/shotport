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

  test("runDoctor returns an exit code without throwing", async () => {
    const runner = new MockRunner();
    const code = await runDoctor(runner);
    expect(typeof code).toBe("number");
    expect([0, 1]).toContain(code);
  });
});
