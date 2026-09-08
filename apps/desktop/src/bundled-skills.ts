import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const RECEIPT_FILE = ".codex-harness-bundled-skills.json";
const SAFE_SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type SkillReceipt = { files: Record<string, string> };
type BundledSkillsReceipt = { version: 1; skills: Record<string, SkillReceipt> };
type SourceFile = { relativePath: string; absolutePath: string; hash: string };

export type BundledSkillsInstallResult = {
  installed: string[];
  updated: string[];
  skipped: string[];
};

function excluded(name: string) {
  const lower = name.toLowerCase();
  return lower === ".git" || lower === "node_modules" || lower === "__pycache__" ||
    lower === ".env" || lower.startsWith(".env.") || lower.endsWith(".pyc") || lower.endsWith(".log");
}

function fileHash(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function relativePathParts(relativePath: string) {
  const parts = relativePath.split("/");
  if (!relativePath || relativePath.includes("\\") || parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts;
}

function validReceipt(receipt: Partial<BundledSkillsReceipt>): receipt is BundledSkillsReceipt {
  if (receipt.version !== 1 || !receipt.skills || typeof receipt.skills !== "object" || Array.isArray(receipt.skills)) return false;
  return Object.entries(receipt.skills).every(([skillName, skill]) =>
    SAFE_SKILL_NAME.test(skillName) && skill && typeof skill === "object" && !Array.isArray(skill) &&
    skill.files && typeof skill.files === "object" && !Array.isArray(skill.files) &&
    Object.entries(skill.files).every(([path, hash]) => relativePathParts(path) && typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))
  );
}

function collectSourceFiles(directory: string, prefix = ""): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (excluded(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`bundled skill contains a symbolic link: ${join(prefix, entry.name)}`);
    const absolutePath = join(directory, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...collectSourceFiles(absolutePath, relativePath));
    else if (entry.isFile()) files.push({ relativePath, absolutePath, hash: fileHash(absolutePath) });
  }
  return files;
}

function loadReceipt(targetRoot: string): BundledSkillsReceipt {
  const path = join(targetRoot, RECEIPT_FILE);
  if (!existsSync(path)) return { version: 1, skills: {} };
  if (lstatSync(path).isSymbolicLink()) throw new Error("bundled skills receipt must not be a symbolic link");
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<BundledSkillsReceipt>;
    if (validReceipt(parsed)) return parsed;
  } catch { /* A damaged receipt must never authorize overwriting user files. */ }
  return { version: 1, skills: {} };
}

function hasSymlinkOnPath(root: string, relativePath = "") {
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) return true;
  let current = root;
  const parts = relativePath ? relativePathParts(relativePath) : [];
  if (!parts) return true;
  for (const part of parts) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

function canUpdate(targetDirectory: string, previous: SkillReceipt, sourceFiles: SourceFile[]) {
  if (!existsSync(targetDirectory) || hasSymlinkOnPath(targetDirectory) || !lstatSync(targetDirectory).isDirectory()) return false;
  for (const [relativePath, expectedHash] of Object.entries(previous.files)) {
    const parts = relativePathParts(relativePath);
    if (!parts) return false;
    const target = join(targetDirectory, ...parts);
    if (hasSymlinkOnPath(targetDirectory, relativePath) || !existsSync(target) || !lstatSync(target).isFile() || fileHash(target) !== expectedHash) return false;
  }
  for (const source of sourceFiles) {
    if (previous.files[source.relativePath]) continue;
    const parts = relativePathParts(source.relativePath);
    if (!parts) return false;
    const target = join(targetDirectory, ...parts);
    if (existsSync(target) || hasSymlinkOnPath(targetDirectory, source.relativePath)) return false;
  }
  return true;
}

function writeSourceFiles(targetDirectory: string, sourceFiles: SourceFile[]) {
  for (const source of sourceFiles) {
    const parts = relativePathParts(source.relativePath);
    if (!parts) throw new Error(`invalid bundled skill path: ${source.relativePath}`);
    const target = join(targetDirectory, ...parts);
    if (hasSymlinkOnPath(targetDirectory, source.relativePath)) throw new Error(`refusing to write through a symbolic link: ${target}`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source.absolutePath, target);
  }
}

function receiptFor(sourceFiles: SourceFile[]): SkillReceipt {
  return { files: Object.fromEntries(sourceFiles.map((file) => [file.relativePath, file.hash])) };
}

export function installBundledSkills(sourceRoot: string, targetRoot: string): BundledSkillsInstallResult {
  const result: BundledSkillsInstallResult = { installed: [], updated: [], skipped: [] };
  if (!existsSync(sourceRoot)) return result;
  if (lstatSync(sourceRoot).isSymbolicLink() || !lstatSync(sourceRoot).isDirectory()) throw new Error("bundled skills source must be a regular directory");
  mkdirSync(targetRoot, { recursive: true });
  if (hasSymlinkOnPath(targetRoot) || !lstatSync(targetRoot).isDirectory()) throw new Error("skills target must be a regular directory");

  const receipt = loadReceipt(targetRoot);
  const nextReceipt: BundledSkillsReceipt = { version: 1, skills: { ...receipt.skills } };
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error(`bundled skill directory is a symbolic link: ${entry.name}`);
    if (!entry.isDirectory() || !SAFE_SKILL_NAME.test(entry.name)) continue;
    const sourceDirectory = join(sourceRoot, entry.name);
    const sourceFiles = collectSourceFiles(sourceDirectory);
    if (!sourceFiles.some((file) => file.relativePath === "SKILL.md")) continue;
    const targetDirectory = join(targetRoot, entry.name);
    const previous = receipt.skills[entry.name];

    if (!existsSync(targetDirectory)) {
      writeSourceFiles(targetDirectory, sourceFiles);
      nextReceipt.skills[entry.name] = receiptFor(sourceFiles);
      result.installed.push(entry.name);
      continue;
    }
    if (!previous || !canUpdate(targetDirectory, previous, sourceFiles)) {
      result.skipped.push(entry.name);
      continue;
    }

    const currentPaths = new Set(sourceFiles.map((file) => file.relativePath));
    for (const relativePath of Object.keys(previous.files)) {
      if (currentPaths.has(relativePath)) continue;
      const parts = relativePathParts(relativePath);
      if (!parts) throw new Error(`invalid managed skill path: ${relativePath}`);
      const stale = join(targetDirectory, ...parts);
      if (existsSync(stale)) unlinkSync(stale);
    }
    writeSourceFiles(targetDirectory, sourceFiles);
    nextReceipt.skills[entry.name] = receiptFor(sourceFiles);
    result.updated.push(entry.name);
  }

  if (result.installed.length || result.updated.length) {
    writeFileSync(join(targetRoot, RECEIPT_FILE), `${JSON.stringify(nextReceipt, null, 2)}\n`, "utf8");
  }
  return result;
}
