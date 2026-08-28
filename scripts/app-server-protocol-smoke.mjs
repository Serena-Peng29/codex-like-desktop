import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const candidates = [
  process.env.CODEX_SIDECAR_PATH,
  process.platform === "win32" ? "apps/desktop/resources/codex.exe" : "apps/desktop/resources/codex"
].filter(Boolean);
const binary = candidates.find((candidate) => existsSync(candidate));
if (!binary) { console.log("protocol-smoke skipped: no real App Server sidecar found"); process.exit(0); }

const child = spawn(binary, ["app-server"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
const lines = createInterface({ input: child.stdout });
const response = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("initialize timeout")), 10_000);
  lines.on("line", (line) => {
    try {
      const message = JSON.parse(line);
      if (message.id !== 1) return;
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message ?? "initialize failed"));
      else resolve(message.result);
    } catch { /* ignore non-JSON diagnostics on stdout */ }
  });
});
child.stdin.write(JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "Way2AGI Code", title: "Way2AGI Code", version: "0.1.0" }, capabilities: { experimentalApi: true } } }) + "\n");
const result = await response;
if (!result?.userAgent || !result?.codexHome || !result?.platformFamily || !result?.platformOs) throw new Error("initialize response is missing required fields");
child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
child.kill();
console.log(`protocol-smoke ok: ${result.userAgent} on ${result.platformOs}`);
