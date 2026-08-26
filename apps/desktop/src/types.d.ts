export {};
declare global {
  interface Window {
    desktop: {
      window: {
        minimize(): Promise<void>;
        toggleMaximize(): Promise<boolean>;
        close(): Promise<void>;
      };
      state(): Promise<{ projectPath: string | null; sidecar: string; gateway: string; gatewayMode: "remote" | "local" }>;
      chooseProject(): Promise<string | null>;
      stream(input: string, options?: { effort?: string }): Promise<{ output: string; usage: Record<string, number> }>;
      previewDiff(input: string): Promise<{ path: string; before: string; after: string; status: string }>;
      applyDiff(diff: { path: string; before: string; after: string }): Promise<void>;
      requestCommand(command: string): Promise<{ approvalId: string; command: string; cwd: string; reason: string }>;
      executeCommand(approvalId: string): Promise<{ stdout: string; stderr: string; code: number }>;
      onApproval(listener: (request: { requestId: number | string; method: string; params: Record<string, unknown> }) => void): () => void;
      respondApproval(requestId: number | string, decision: "accept" | "decline" | "cancel"): Promise<void>;
    };
  }
}
