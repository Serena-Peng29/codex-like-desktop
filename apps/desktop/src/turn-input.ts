import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type TurnInput =
  | { type: "text"; text: string }
  | { type: "localImage"; path: string }
  | { type: "mention"; name: string; path: string };

// Keep attachment expansion below the upstream one-megabyte text-input cap.
export const MAX_ATTACHMENT_TEXT_CHARS = 256 * 1024;
export const MAX_ATTACHMENT_TOTAL_CHARS = 768 * 1024;

function localPath(path: string) {
  if (!path.trim()) return null;
  if (path.startsWith("file://")) {
    try { return fileURLToPath(path); } catch { return null; }
  }
  // Structured app/plugin/MCP mentions must stay mentions; only filesystem
  // paths are expanded into model-readable attachment text.
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) return null;
  return path;
}

function isLikelyText(value: Buffer) {
  if (value.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(value);
    return true;
  } catch { return false; }
}

function clipped(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 43))}\n[...文件内容已截断...]`;
}

function attachmentText(item: Extract<TurnInput, { type: "mention" }>, remaining: number) {
  const path = localPath(item.path);
  if (!path || remaining < 96) return null;
  const label = item.name.trim() || path.split(/[\\/]/).pop() || path;
  const header = `[Attached local file: ${label}]\n`;
  try {
    const bytes = readFileSync(path);
    const budget = Math.min(MAX_ATTACHMENT_TEXT_CHARS, remaining);
    if (isLikelyText(bytes)) {
      const text = clipped(bytes.toString("utf8"), Math.max(0, budget - header.length - 16));
      return `${header}<file>\n${text}\n</file>`;
    }
    if (bytes.length <= Math.min(128 * 1024, Math.floor(budget / 2))) {
      return `${header}<binary encoding="base64" mime="application/octet-stream">\n${bytes.toString("base64")}\n</binary>`;
    }
    return `${header}[二进制文件 ${bytes.length} 字节，超出内联限制；请使用本地工具读取该路径。]`;
  } catch {
    return `${header}[无法读取本地文件：${path}]`;
  }
}

/** Expand local-file mentions into actual model input while preserving the
 * mention item so the desktop can render the attachment after history reload. */
export function expandLocalFileInputs(input: TurnInput[]) {
  const expanded: TurnInput[] = [];
  let remaining = MAX_ATTACHMENT_TOTAL_CHARS;
  for (const item of input) {
    expanded.push(item);
    if (item.type !== "mention") continue;
    const content = attachmentText(item, remaining);
    if (!content) continue;
    expanded.push({ type: "text", text: content });
      remaining = Math.max(0, remaining - content.length);
  }
  return expanded;
}
