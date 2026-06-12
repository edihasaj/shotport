import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import type { RunResult, Runner } from "./types";

export class ProcessRunner implements Runner {
  async run(args: string[], input?: string): Promise<RunResult> {
    return new Promise((resolve) => {
      const child = spawn(args[0]!, args.slice(1), {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        resolve({ code: 127, stdout, stderr: String(error.message) });
      });
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
      if (input) child.stdin.end(input);
      else child.stdin.end();
    });
  }

  async exists(command: string): Promise<boolean> {
    if (command.includes("/")) {
      try {
        await access(command, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }
    const result = await this.run(["/usr/bin/env", "bash", "-lc", `command -v ${shellQuote(command)}`]);
    return result.code === 0 && result.stdout.trim().length > 0;
  }
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
