import { expect, test } from "bun:test";
import { formatResult } from "../src/output";

test("formats compact human output", () => {
  const text = formatResult({
    target: "browser https://example.com",
    notes: [],
    image: { path: "/tmp/x.webp", width: 640, height: 360, format: "webp", tokens: 308, notes: [] },
    text: { source: "a11y", text: "Example Domain", notes: [] },
  }, false);
  expect(text).toContain("target: browser https://example.com · 640x360 webp -> /tmp/x.webp (~308 img tokens)");
  expect(text).toContain("TEXT (a11y):\nExample Domain");
});

test("formats json output", () => {
  const text = formatResult({ target: "android", notes: ["adb not installed; capture skipped"] }, true);
  expect(JSON.parse(text).notes[0]).toContain("adb not installed");
});
