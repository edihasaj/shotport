// `shotport doctor` delegates macOS permissions to guiport, the signed system
// layer that performs shotport's desktop capture and accessibility work.

import type { Runner } from "./types";

export async function runDoctor(runner: Runner): Promise<number> {
  const out: string[] = ["shotport doctor"];

  const platform = runner.platform ?? process.platform;
  if (platform !== "darwin") {
    out.push("  Screen capture permissions are only enforced on macOS. Nothing to grant here.");
    process.stdout.write(out.join("\n") + "\n");
    return 0;
  }

  if (!(await runner.exists("guiport"))) {
    out.push("  ✗ guiport: not installed");
    out.push("    Install it with `brew install edihasaj/guiport/guiport`, then re-run.");
    process.stdout.write(out.join("\n") + "\n");
    return 1;
  }

  out.push("  → guiport owns the single macOS permission identity");
  const result = await runner.run(["guiport", "doctor", "--fix"]);
  if (result.stdout.trim()) out.push(result.stdout.trimEnd());
  if (result.stderr.trim()) out.push(result.stderr.trimEnd());

  out.push(result.code === 0
    ? "\nREADY. Shotport captures through guiport."
    : "\nComplete the guiport permission prompts, then re-run `shotport doctor`.");
  process.stdout.write(out.join("\n") + "\n");
  return result.code;
}
