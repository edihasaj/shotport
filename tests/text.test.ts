import { describe, expect, test } from "bun:test";
import { ocrBoxes, parseBoxLines } from "../src/text";
import { parseArgv } from "../src/parse";
import { MockRunner } from "./mockRunner";

describe("ocr boxes", () => {
  test("parseBoxLines parses tab-separated x/y/w/h/text lines", () => {
    const out = "10\t20\t30\t12\tHello\n700\t860\t97\t13\tType a message\n";
    expect(parseBoxLines(out)).toEqual([
      { text: "Hello", x: 10, y: 20, w: 30, h: 12 },
      { text: "Type a message", x: 700, y: 860, w: 97, h: 13 },
    ]);
  });

  test("parseBoxLines skips malformed lines", () => {
    expect(parseBoxLines("nope\n1\t2\t3\n5\t5\t5\t5\tok\n")).toEqual([
      { text: "ok", x: 5, y: 5, w: 5, h: 5 },
    ]);
  });

  test("linux tesseract TSV aggregates words into per-line boxes", async () => {
    const runner = new MockRunner(["tesseract"]);
    runner.platform = "linux";
    const tsv = [
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "5\t1\t1\t1\t1\t1\t10\t20\t30\t12\t95\tHello",
      "5\t1\t1\t1\t1\t2\t45\t20\t40\t12\t96\tWorld",
      "5\t1\t1\t1\t2\t1\t10\t40\t50\t12\t90\tSecond",
    ].join("\n");
    runner.on((a) => a[0] === "tesseract" && a.includes("tsv"), { stdout: tsv });
    const { boxes } = await ocrBoxes(runner, "/x.png");
    expect(boxes).toContainEqual({ text: "Hello World", x: 10, y: 20, w: 75, h: 12 });
    expect(boxes).toContainEqual({ text: "Second", x: 10, y: 40, w: 50, h: 12 });
  });

  test("ocr --boxes flag parses", () => {
    const cmd = parseArgv(["ocr", "shot.png", "--boxes"]);
    expect(cmd).toMatchObject({ kind: "ocr", path: "shot.png", boxes: true });
    const plain = parseArgv(["ocr", "shot.png"]);
    expect(plain).toMatchObject({ kind: "ocr", boxes: false });
  });
});
