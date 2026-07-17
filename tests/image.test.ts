import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { budgetImage, estimateImageTokens, pickMaxEdge, readImageSize } from "../src/image";
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

// A 2x1 PNG (real IHDR: width=2 height=1) so header parsing has something valid.
function png2x1(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVR4nGP8z8Dwn wEABQAB/6toRRcAAAAASUVORK5CYII=".replace(/\s/g, ""),
    "base64",
  );
}

describe("image budgeting", () => {
  test("estimates Anthropic-style image tokens", () => {
    expect(estimateImageTokens(750, 750)).toBe(750);
    expect(estimateImageTokens(1280, 720)).toBe(1229);
  });

  test("caps long edge by default max", () => {
    expect(pickMaxEdge(3000, 2000, 1280)).toBe(1280);
  });

  test("shrinks to fit token budget", () => {
    const edge = pickMaxEdge(2000, 1000, 2000, 750);
    expect(edge).toBeLessThan(2000);
    expect(edge).toBeGreaterThanOrEqual(64);
  });
});

describe("cross-platform image size", () => {
  test("windows reads dimensions via System.Drawing (powershell)", async () => {
    const runner = new MockRunner();
    runner.platform = "win32";
    runner.on((a) => a[0] === "powershell", { stdout: "800 600\n" });
    expect(await readImageSize(runner, "C:/x.png")).toEqual({ width: 800, height: 600 });
  });

  test("linux reads dimensions via imagemagick identify", async () => {
    const runner = new MockRunner(["identify"]);
    runner.platform = "linux";
    runner.on((a) => a[0] === "identify", { stdout: "1024 768" });
    expect(await readImageSize(runner, "/x.png")).toEqual({ width: 1024, height: 768 });
  });

  test("falls back to header parse when no image tool exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shotport-imgtest-"));
    const file = join(dir, "px.png");
    await writeFile(file, png2x1());
    const runner = new MockRunner(); // no identify, powershell returns nonzero
    runner.platform = "linux";
    expect(await readImageSize(runner, file)).toEqual({ width: 2, height: 1 });
  });

  test("keeps the captured image when resize is unavailable (no sips/imagemagick)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shotport-imgtest-"));
    const file = join(dir, "big.png");
    await writeFile(file, png2x1());
    const runner = new MockRunner();
    runner.platform = "linux"; // no identify, no convert -> resize unavailable
    // Force a resize attempt by pretending the source is huge via a tiny maxPx.
    const info = await budgetImage(runner, file, { ...global, maxPx: 1 });
    // Image survives (path set, real header dims) even though resize couldn't run.
    expect(info.path).toBeTruthy();
    expect(info.width).toBe(2);
    expect(info.notes.some((n) => n.includes("resize skipped"))).toBe(true);
  });
});
