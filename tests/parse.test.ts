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
});
