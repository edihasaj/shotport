import { describe, expect, test } from "bun:test";
import { UsageError } from "../src/errors";
import { parseArgv } from "../src/parse";

describe("parseArgv", () => {
  test("parses browser flags independent of position", () => {
    const command = parseArgv(["browser", "https://example.com", "--element", "main", "--budget", "900", "--webp"]);
    expect(command.kind).toBe("browser");
    if (command.kind !== "browser") return;
    expect(command.options).toEqual({ url: "https://example.com", element: "main", clip: undefined });
    expect(command.global.budget).toBe(900);
    expect(command.global.format).toBe("webp");
  });

  test("rejects incompatible output modes", () => {
    expect(() => parseArgv(["desktop", "--text-only", "--image-only"])).toThrow(UsageError);
  });

  test("parses app window and region", () => {
    const command = parseArgv(["app", "Calculator", "--window", "Calc", "--region", "1,2,3,4"]);
    expect(command.kind).toBe("app");
    if (command.kind !== "app") return;
    expect(command.options.window).toBe("Calc");
    expect(command.options.region).toBe("1,2,3,4");
  });

  test("parses window subcommand with no app name", () => {
    const command = parseArgv(["window", "--full-text", "--text-only"]);
    expect(command.kind).toBe("window");
    if (command.kind !== "window") return;
    expect(command.global.textOnly).toBe(true);
    expect(command.global.maxChars).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("--max-chars sets the text cap; default is 6000", () => {
    const def = parseArgv(["window"]);
    const set = parseArgv(["window", "--max-chars", "20000"]);
    expect(def.kind).toBe("window");
    expect(set.kind).toBe("window");
    if (def.kind !== "window" || set.kind !== "window") return;
    expect(def.global.maxChars).toBe(6000);
    expect(set.global.maxChars).toBe(20000);
  });
});
