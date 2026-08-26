export const PROTOCOL_VERSION = "phase-0";

export type JsonRpcRequest = { jsonrpc: "2.0"; id: number; method: string; params?: Record<string, unknown> };
export type JsonRpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: number; message: string } };

export type DiffChange = { path: string; before: string; after: string; status: "modified" | "created" };
export type CommandApproval = { command: string; cwd: string; reason: string };
export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; chargedCredits: number; remainingCredits: number };

export const APP_SERVER_METHODS = {
  initialize: "initialize",
  initialized: "initialized",
  threadStart: "thread/start",
  turnStart: "turn/start",
  fsReadFile: "fs/readFile",
  fsWriteFile: "fs/writeFile"
} as const;

export type AppServerInitializeParams = {
  clientInfo: { name: string; title?: string; version: string };
  capabilities?: { experimentalApi?: boolean; requestAttestation?: boolean };
};

export type AppServerThreadStartParams = {
  model?: string;
  cwd?: string;
  approvalPolicy?: string;
  sandbox?: string;
  ephemeral?: boolean;
};

export type AppServerTurnStartParams = {
  threadId: string;
  input: Array<{ type: "text"; text: string }>;
  cwd?: string;
  model?: string;
};

export type AppServerNotification = { jsonrpc: "2.0"; method: string; params?: Record<string, unknown> };
