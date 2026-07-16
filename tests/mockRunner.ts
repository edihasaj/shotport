import type { RunResult, Runner } from "../src/types";

export interface Call {
  args: string[];
  input?: string;
}

export class MockRunner implements Runner {
  readonly calls: Call[] = [];
  readonly commands = new Set<string>();
  // Default tests to the macOS capture path so they run identically on any CI
  // host; per-OS tests can override this.
  platform: NodeJS.Platform = "darwin";
  private handlers: Array<{ match: (args: string[]) => boolean; result: RunResult | ((args: string[]) => Promise<RunResult> | RunResult) }> = [];

  constructor(commands: string[] = []) {
    for (const command of commands) this.commands.add(command);
  }

  on(match: (args: string[]) => boolean, result: Partial<RunResult> | ((args: string[]) => Promise<Partial<RunResult>> | Partial<RunResult>)): void {
    if (typeof result === "function") {
      this.handlers.push({
        match,
        result: async (args) => ({ code: 0, stdout: "", stderr: "", ...(await result(args)) }),
      });
      return;
    }
    this.handlers.push({ match, result: { code: 0, stdout: "", stderr: "", ...result } });
  }

  async run(args: string[], input?: string): Promise<RunResult> {
    this.calls.push({ args, input });
    const handler = this.handlers.find((item) => item.match(args));
    if (!handler) return { code: 0, stdout: "", stderr: "" };
    return typeof handler.result === "function" ? handler.result(args) : handler.result;
  }

  async exists(command: string): Promise<boolean> {
    return this.commands.has(command);
  }
}
