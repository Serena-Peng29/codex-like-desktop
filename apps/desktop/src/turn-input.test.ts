import { describe, expect, it } from "vitest";
import { buildTurnInputItems, sliceUtf8ByByteRange, type WireTextElement } from "./turn-input.js";

describe("buildTurnInputItems", () => {
  it("keeps images and structured mentions unchanged", () => {
    const input = [
      { type: "localImage" as const, path: "C:\\tmp\\screen.png" },
      { type: "mention" as const, name: "Demo App", path: "app://demo-app" }
    ];
    expect(buildTurnInputItems(input)).toEqual([
      { type: "localImage", path: "C:\\tmp\\screen.png" },
      { type: "mention", name: "Demo App", path: "app://demo-app" }
    ]);
  });

  it("passes plain text through without attachment markers", () => {
    expect(buildTurnInputItems([{ type: "text", text: "帮我看看构建" }])).toEqual([{ type: "text", text: "帮我看看构建" }]);
  });

  it("folds file attachments into path lines marked with text elements", () => {
    const result = buildTurnInputItems([
      { type: "text", text: "总结这个文件" },
      { type: "mention", name: "README.md", path: "D:\\docs\\README.md" }
    ]);
    expect(result).toHaveLength(1);
    const item = result[0] as { type: "text"; text: string; text_elements: WireTextElement[] };
    expect(item.type).toBe("text");
    expect(item.text).toContain("总结这个文件");
    expect(item.text).toContain("D:\\docs\\README.md");
    expect(item.text).not.toContain("<file>");
    expect(item.text_elements).toHaveLength(1);
    const [element] = item.text_elements;
    expect(sliceUtf8ByByteRange(item.text, element.byteRange.start, element.byteRange.end)).toBe("D:\\docs\\README.md");
    expect(element.placeholder).toBe("README.md");
  });

  it("computes byte ranges over utf-8 offsets after multibyte text", () => {
    const result = buildTurnInputItems([{ type: "mention", name: "笔记.md", path: "D:\\资料\\笔记.md" }]);
    const item = result[0] as { type: "text"; text: string; text_elements: WireTextElement[] };
    // "Attached files:" is ASCII but the placeholder and header path are not.
    expect(sliceUtf8ByByteRange(item.text, item.text_elements[0].byteRange.start, item.text_elements[0].byteRange.end)).toBe("D:\\资料\\笔记.md");
    expect(item.text_elements[0].placeholder).toBe("笔记.md");
  });

  it("keeps interleaved attachments and images in submission order", () => {
    const result = buildTurnInputItems([
      { type: "text", text: "对比" },
      { type: "mention", name: "a.txt", path: "C:\\tmp\\a.txt" },
      { type: "localImage", path: "C:\\tmp\\shot.png" },
      { type: "mention", name: "b.txt", path: "C:\\tmp\\b.txt" }
    ]);
    expect(result.map((item) => item.type)).toEqual(["text", "localImage", "text"]);
    const first = result[0] as { text: string; text_elements: WireTextElement[] };
    expect(first.text).toContain("C:\\tmp\\a.txt");
    expect(first.text_elements).toHaveLength(1);
    const second = result[2] as { text: string; text_elements: WireTextElement[] };
    expect(sliceUtf8ByByteRange(second.text, second.text_elements[0].byteRange.start, second.text_elements[0].byteRange.end)).toBe("C:\\tmp\\b.txt");
  });

  it("returns no items for empty input", () => {
    expect(buildTurnInputItems([])).toEqual([]);
  });
});
