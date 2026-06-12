import { describe, expect, test } from "bun:test";
import { estimateImageTokens, pickMaxEdge } from "../src/image";

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
