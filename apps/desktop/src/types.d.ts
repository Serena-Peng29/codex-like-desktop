export {};
declare global {
  interface Window {
    desktop: {
      window: {
        minimize(): Promise<void>;
        toggleMaximize(): Promise<boolean>;
        close(): Promise<void>;
      };
      state(): Promise<{ projectPath: string | null; activeThreadId: string | null; unassignedThreadIds?: string[]; history: Array<{ id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown }>; sidecar: string; gateway: string; gatewayMode: "remote" | "local" }>;
      chooseProject(): Promise<string | null>;
      setProject(path: string): Promise<string>;
      clearProject(): Promise<void>;
      history(): Promise<Array<{ id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown }>>;
      loadThread(threadId: string): Promise<{ thread?: { id?: string; turns?: Array<{ items?: Array<Record<string, unknown>> }> } }>;
      newThread(): Promise<void>;
      stream(input: string, options?: { effort?: string }): Promise<{ output: string; usage: Record<string, number> }>;
      previewDiff(input: string): Promise<{ path: string; before: string; after: string; status: string }>;
      applyDiff(diff: { path: string; before: string; after: string }): Promise<void>;
      requestCommand(command: string): Promise<{ approvalId: string; command: string; cwd: string; reason: string }>;
      executeCommand(approvalId: string): Promise<{ stdout: string; stderr: string; code: number }>;
      onApproval(listener: (request: { requestId: number | string; method: string; params: Record<string, unknown> }) => void): () => void;
      respondApproval(requestId: number | string, decision: "accept" | "decline" | "cancel"): Promise<void>;
      onMessageDelta(listener: (event: { threadId?: string; turnId?: string; itemId?: string; delta: string }) => void): () => void;
      onAppServerEvent(listener: (event: { method: string; params: Record<string, unknown> }) => void): () => void;
      onAppServerRequest(listener: (request: { requestId: number | string; method: string; params: Record<string, unknown> }) => void): () => void;
    };
  }
}
