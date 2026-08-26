import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";

const required = [
  "apps/desktop/dist/main.js",
  "apps/desktop/dist/preload.cjs",
  "apps/desktop/dist/renderer/index.html",
  "services/model-gateway/dist/server.js",
  "services/billing/dist/ledger.js",
  "scripts/mock-app-server.js"
];
const missing = required.filter((file) => !existsSync(file));
if (missing.length) { console.error(`startup-check missing: ${missing.join(", ")}`); process.exit(1); }
const rendererHtml = readFileSync("apps/desktop/dist/renderer/index.html", "utf8");
if (rendererHtml.includes('src="/assets/') || rendererHtml.includes('href="/assets/')) throw new Error("renderer assets must use relative paths for Electron file:// loading");

const child = spawn(process.execPath, ["scripts/mock-app-server.js"], { stdio: ["pipe", "pipe", "pipe"] });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "Way2AGI Code", title: "Way2AGI Code", version: "0.1.0" }, capabilities: { experimentalApi: true } } }) + "\n");
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("mock sidecar timeout")), 3000); child.stdout.once("data", () => { clearTimeout(timer); resolve(); }); });
child.kill();
if (!output.includes('"id":1') || !output.includes("userAgent")) throw new Error("mock sidecar handshake failed");
console.log("startup-check ok: desktop artifacts, gateway artifacts, and sidecar handshake");
