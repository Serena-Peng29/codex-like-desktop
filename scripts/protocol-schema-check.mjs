import { readFile } from "node:fs/promises";

const root = "vendor/codex/codex-rs/app-server-protocol/schema/json";
const expected = {
  ClientRequest: ["InitializeRequest", "Thread/startRequest", "Turn/startRequest", "Fs/readFileRequest", "Fs/writeFileRequest"],
  ServerRequest: ["Item/commandExecution/requestApprovalRequest", "Item/fileChange/requestApprovalRequest"],
  ServerNotification: ["Thread/startedNotification", "Item/agentMessage/deltaNotification", "Turn/completedNotification"]
};
for (const [file, titles] of Object.entries(expected)) {
  const schema = JSON.parse(await readFile(`${root}/${file}.json`, "utf8"));
  const actual = new Set((schema.oneOf ?? []).map((entry) => entry.title));
  const missing = titles.filter((title) => !actual.has(title));
  if (missing.length) throw new Error(`${file} missing upstream methods: ${missing.join(", ")}`);
}
console.log("protocol-schema-check ok: pinned upstream schema contains required Phase 0 methods");
