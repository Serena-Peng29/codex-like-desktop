import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { installBundledSkills } from "./bundled-skills.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "codex-harness-skills-"));
  temporaryDirectories.push(directory);
  return directory;
}

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("installBundledSkills", () => {
  it("installs a bundled skill and excludes environment files", () => {
    const root = temporaryDirectory();
    const source = join(root, "source");
    const target = join(root, "target");
    write(join(source, "legal-review", "SKILL.md"), "---\nname: legal-review\n---\n");
    write(join(source, "legal-review", "scripts", "review.py"), "print('ok')\n");
    write(join(source, "legal-review", ".env"), "API_KEY=secret\n");

    const result = installBundledSkills(source, target);

    expect(result.installed).toEqual(["legal-review"]);
    expect(readFileSync(join(target, "legal-review", "scripts", "review.py"), "utf8")).toBe("print('ok')\n");
    expect(existsSync(join(target, "legal-review", ".env"))).toBe(false);
  });

  it("updates an unchanged managed skill and removes stale managed files", () => {
    const root = temporaryDirectory();
    const source = join(root, "source");
    const target = join(root, "target");
    const manifest = join(source, "legal-review", "SKILL.md");
    const stale = join(source, "legal-review", "stale.txt");
    write(manifest, "version 1\n");
    write(stale, "old\n");
    installBundledSkills(source, target);
    write(manifest, "version 2\n");
    unlinkSync(stale);

    const result = installBundledSkills(source, target);

    expect(result.updated).toEqual(["legal-review"]);
    expect(readFileSync(join(target, "legal-review", "SKILL.md"), "utf8")).toBe("version 2\n");
    expect(existsSync(join(target, "legal-review", "stale.txt"))).toBe(false);
  });

  it("preserves a managed skill after the user modifies it", () => {
    const root = temporaryDirectory();
    const source = join(root, "source");
    const target = join(root, "target");
    const sourceManifest = join(source, "legal-review", "SKILL.md");
    const targetManifest = join(target, "legal-review", "SKILL.md");
    write(sourceManifest, "version 1\n");
    installBundledSkills(source, target);
    write(targetManifest, "user version\n");
    write(sourceManifest, "version 2\n");

    const result = installBundledSkills(source, target);

    expect(result.skipped).toEqual(["legal-review"]);
    expect(readFileSync(targetManifest, "utf8")).toBe("user version\n");
  });

  it("does not claim or overwrite a pre-existing skill", () => {
    const root = temporaryDirectory();
    const source = join(root, "source");
    const target = join(root, "target");
    write(join(source, "legal-review", "SKILL.md"), "bundled\n");
    write(join(target, "legal-review", "SKILL.md"), "user installed\n");

    const result = installBundledSkills(source, target);

    expect(result.skipped).toEqual(["legal-review"]);
    expect(readFileSync(join(target, "legal-review", "SKILL.md"), "utf8")).toBe("user installed\n");
  });

  it("does not trust paths from a tampered receipt", () => {
    const root = temporaryDirectory();
    const source = join(root, "source");
    const target = join(root, "target");
    const outside = join(root, "outside.txt");
    write(join(source, "legal-review", "SKILL.md"), "version 1\n");
    write(join(target, "legal-review", "SKILL.md"), "user version\n");
    write(outside, "keep\n");
    write(join(target, ".codex-harness-bundled-skills.json"), JSON.stringify({
      version: 1,
      skills: { "legal-review": { files: { "../../outside.txt": "a".repeat(64) } } }
    }));

    const result = installBundledSkills(source, target);

    expect(result.skipped).toEqual(["legal-review"]);
    expect(readFileSync(outside, "utf8")).toBe("keep\n");
    expect(readFileSync(join(target, "legal-review", "SKILL.md"), "utf8")).toBe("user version\n");
  });

  it("does not trust hashes from a malformed receipt", () => {
    const root = temporaryDirectory();
    const source = join(root, "source");
    const target = join(root, "target");
    const targetManifest = join(target, "legal-review", "SKILL.md");
    write(join(source, "legal-review", "SKILL.md"), "bundled\n");
    write(targetManifest, "user version\n");
    write(join(target, ".codex-harness-bundled-skills.json"), JSON.stringify({
      version: 1,
      skills: { "legal-review": { files: { "SKILL.md": "not-a-sha256" } } }
    }));

    const result = installBundledSkills(source, target);

    expect(result.skipped).toEqual(["legal-review"]);
    expect(readFileSync(targetManifest, "utf8")).toBe("user version\n");
  });
});
