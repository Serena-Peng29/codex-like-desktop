// Attachment handling follows the pinned upstream App Server protocol: images
// travel as `localImage` path items (core reads and encodes the file itself),
// and non-image files stay as readable paths inside the message text instead of
// inlined file contents. Upstream marks UI-rendered spans in that text with
// `TextElement` byte ranges, which is what the desktop uses to restore file
// chips after a history reload.

export type TurnInput =
  | { type: "text"; text: string }
  | { type: "localImage"; path: string }
  | { type: "mention"; name: string; path: string };

// Upstream v2 `UserInput::Text` serializes its field as `text_elements`
// (snake_case on the enum variant) while `TextElement` itself is camelCase
// (`byteRange`) — see app-server-protocol v2/turn.rs at the pinned commit.
export type WireTextElement = { byteRange: { start: number; end: number }; placeholder?: string };
export type WireInputItem =
  | { type: "text"; text: string; text_elements?: WireTextElement[] }
  | { type: "localImage"; path: string }
  | { type: "mention"; name: string; path: string };

const attachmentHeader = "Attached files:";

/** Slice `text` by UTF-8 byte offsets, the unit upstream `ByteRange` uses. */
export function sliceUtf8ByByteRange(text: string, start: number, end: number): string {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end) return "";
  const bytes = new TextEncoder().encode(text);
  if (end > bytes.length) return "";
  return new TextDecoder().decode(bytes.subarray(start, end));
}

/** Return `text` without the given UTF-8 byte spans, keeping everything else. */
export function removeUtf8Spans(text: string, spans: Array<{ start: number; end: number }>): string {
  if (!spans.length) return text;
  const bytes = new TextEncoder().encode(text);
  const decoder = new TextDecoder();
  let out = "";
  let cursor = 0;
  for (const span of [...spans].sort((first, second) => first.start - second.start)) {
    if (span.start < cursor || span.end > bytes.length || span.start >= span.end) continue;
    out += decoder.decode(bytes.subarray(cursor, span.start));
    cursor = span.end;
  }
  return out + decoder.decode(bytes.subarray(cursor));
}

// Structured app/plugin/MCP mentions must stay mentions; only filesystem paths
// are attachments that get folded into the message text.
function isStructuredUri(path: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(path);
}

/** Convert renderer turn input into upstream-conformant wire items. File
 * attachments become path lines marked with text elements so the model reads
 * them from disk and the UI can render chips; file contents are never inlined. */
export function buildTurnInputItems(input: TurnInput[]): WireInputItem[] {
  const items: WireInputItem[] = [];
  const encoder = new TextEncoder();
  let text = "";
  let byteLength = 0;
  let headerOffset = -1;
  const elements: WireTextElement[] = [];

  const append = (chunk: string) => {
    if (!chunk) return;
    text += chunk;
    byteLength += encoder.encode(chunk).length;
  };
  const flush = () => {
    if (text) items.push(elements.length ? { type: "text", text, text_elements: [...elements] } : { type: "text", text });
    text = "";
    byteLength = 0;
    headerOffset = -1;
    elements.length = 0;
  };

  for (const item of input) {
    if (item.type === "text") {
      if (!item.text) continue;
      if (text && !text.endsWith("\n")) append("\n");
      append(item.text);
      continue;
    }
    if (item.type === "localImage" || isStructuredUri(item.path)) {
      flush();
      items.push(item.type === "localImage" ? { type: "localImage", path: item.path } : { type: "mention", name: item.name, path: item.path });
      continue;
    }
    if (headerOffset < 0) {
      if (text) append(text.endsWith("\n") ? "\n" : "\n\n");
      headerOffset = byteLength;
      append(`${attachmentHeader}\n`);
    }
    const placeholder = item.name.trim() || item.path.split(/[\\/]/).pop() || item.path;
    const start = byteLength;
    append(item.path);
    elements.push({ byteRange: { start, end: byteLength }, placeholder });
    append("\n");
  }
  flush();
  return items;
}
