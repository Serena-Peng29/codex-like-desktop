import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandLocalFileInputs } from "./turn-input.js";

describe("expandLocalFileInputs", () => {
  it("keeps images and structured mentions unchanged", () => {
    const input = [
      { type: "localImage" as const, path: "C:\\tmp\\screen.png" },
      { type: "mention" as const, name: "Demo App", path: "app://demo-app" }
    ];
    expect(expandLocalFileInputs(input)).toEqual(input);
  });

  it("adds readable local file content while preserving the attachment item", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-input-"));
    const file = join(root, "notes.txt");
    writeFileSync(file, "hello from attachment", "utf8");
    const result = expandLocalFileInputs([{ type: "mention", name: "notes.txt", path: file }]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "mention", name: "notes.txt", path: file });
    expect(result[1]).toMatchObject({ type: "text" });
    expect((result[1] as { type: "text"; text: string }).text).toContain("hello from attachment");
  });

  it("does not read directories as attachments", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-input-"));
    mkdirSync(join(root, "nested"));
    const result = expandLocalFileInputs([{ type: "mention", name: "nested", path: join(root, "nested") }]);
    expect(result).toHaveLength(2);
    expect((result[1] as { type: "text"; text: string }).text).toContain("无法读取本地文件");
  });
});
