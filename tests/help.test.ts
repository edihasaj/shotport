import { describe, expect, test } from "bun:test";
import packageMetadata from "../package.json";
import { helpText, VERSION } from "../src/help";

describe("version metadata", () => {
  test("matches package metadata in version output and help", () => {
    expect(VERSION).toBe(packageMetadata.version);
    expect(helpText()).toStartWith(`shotport ${packageMetadata.version}\n`);
  });
});
