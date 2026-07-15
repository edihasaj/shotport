// `shotport doctor` — check and request the macOS permissions shotport needs,
// so a fresh install prompts the user instead of making them hand-add the binary.

import { hasAccessibility, hasScreenRecording, requestScreenRecording, SETTINGS_URL } from "./permissions";
import type { Runner } from "./types";

export async function runDoctor(runner: Runner): Promise<number> {
  const out: string[] = ["shotport doctor"];

  if (process.platform !== "darwin") {
    out.push("  Screen capture permissions are only enforced on macOS — nothing to grant here.");
    process.stdout.write(out.join("\n") + "\n");
    return 0;
  }

  // Screen Recording — required for pixel capture. Requesting fires the OS
  // prompt and registers shotport in the Screen Recording list the first time.
  let screen = hasScreenRecording();
  if (screen !== "granted") screen = requestScreenRecording();
  out.push(`  ${mark(screen)} Screen Recording: ${screen}`);
  if (screen !== "granted") {
    await open(runner, SETTINGS_URL.screenRecording);
    out.push("    → Approve shotport in the window that just opened");
    out.push("      (System Settings → Privacy & Security → Screen Recording), then re-run.");
  }

  // Accessibility — used for the a11y text tree. shotport reads it via guiport,
  // so its own grant is optional; report it and open the pane if missing.
  const ax = hasAccessibility();
  out.push(`  ${ax === "granted" ? "✓" : "○"} Accessibility: ${ax}  (optional — a11y text; guiport also provides this)`);
  if (ax !== "granted") await open(runner, SETTINGS_URL.accessibility);

  const ready = screen === "granted";
  out.push(ready ? "\nREADY — shotport can capture." : "\nGrant Screen Recording above, then re-run `shotport doctor`.");
  process.stdout.write(out.join("\n") + "\n");
  return ready ? 0 : 1;
}

function mark(state: string): string {
  return state === "granted" ? "✓" : "✗";
}

async function open(runner: Runner, url: string): Promise<void> {
  try {
    await runner.run(["open", url]);
  } catch {
    // best-effort — the printed guidance still tells the user where to go
  }
}
