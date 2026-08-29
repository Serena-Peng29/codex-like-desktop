export {};
declare global {
  interface Window {
    desktop: {
      window: {
        minimize(): Promise<void>;
        toggleMaximize(): Promise<boolean>;
        close(): Promise<void>;
      };
      state(): Promise<{
        projectPath: string | null;
        activeThreadId: string | null;
        activeTurnThreadId?: string | null;
        activeTurnId?: string | null;
        unassignedThreadIds?: string[];
        threadProjectPaths?: Record<string, string | null>;
        threadDisplayNames?: Record<string, string>;
        pinnedThreadIds?: string[];
        projectMeta?: Record<string, { name?: string; folders?: string[] }>;
        pinnedProjects?: string[];
        removedProjects?: string[];
        history: Array<{ id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown }>;
        sidecar: string;
        gateway: string;
        gatewayMode: "remote" | "local";
      }>;
      chooseProject(): Promise<string | null>;
      setProject(path: string): Promise<string>;
      clearProject(): Promise<void>;
      chooseFolders(): Promise<string[]>;
      revealProject(path: string): Promise<void>;
      listDirectory(path: string): Promise<{ path: string; entries: Array<{ name: string; path: string; kind: "dir" | "file" }> }>;
      readFile(path: string): Promise<{ path: string; content: string }>;
      imagePreview(path: string): Promise<string | null>;
      setProjectMeta(path: string, meta: { name?: string; folders?: string[] }): Promise<Record<string, { name?: string; folders?: string[] }>>;
      toggleProjectPin(path: string): Promise<string[]>;
      removeProject(path: string): Promise<void>;
      history(): Promise<Array<{ id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown }>>;
      loadThread(threadId: string, projectPath?: string | null): Promise<{ thread?: { id?: string; turns?: Array<{ items?: Array<Record<string, unknown>> }> } }>;
      newThread(projectPath?: string | null): Promise<void>;
      setThreadName(threadId: string, name: string): Promise<Record<string, string>>;
      toggleThreadPin(threadId: string): Promise<string[]>;
      setThreadProject(threadId: string, projectPath: string | null): Promise<void>;
      stream(input: Array<{ type: "text"; text: string } | { type: "localImage"; path: string } | { type: "mention"; name: string; path: string }>, options?: { effort?: string; planMode?: boolean }): Promise<{ output: string; usage: Record<string, number> }>;
      interrupt(): Promise<boolean>;
      chooseFiles(mode?: "image" | "file"): Promise<Array<{ path: string; name: string; image: boolean; preview?: string }>>;
      savePastedImage(dataUrl: string): Promise<{ path: string; name: string; preview?: string }>;
      setGoal(objective: string): Promise<unknown>;
      getGoal(): Promise<{ goal?: { objective?: string } | null }>;
      clearGoal(): Promise<{ cleared?: boolean }>;
      previewDiff(input: string): Promise<{ path: string; before: string; after: string; status: string }>;
      applyDiff(diff: { path: string; before: string; after: string }): Promise<void>;
      requestCommand(command: string): Promise<{ approvalId: string; command: string; cwd: string; reason: string }>;
      executeCommand(approvalId: string): Promise<{ stdout: string; stderr: string; code: number }>;
      onApproval(listener: (request: { requestId: number | string; method: string; params: Record<string, unknown> }) => void): () => void;
      respondApproval(requestId: number | string, method: string, payload: Record<string, unknown>): Promise<void>;
      onMessageDelta(listener: (event: { threadId?: string; turnId?: string; itemId?: string; delta: string }) => void): () => void;
      onAppServerEvent(listener: (event: { method: string; params: Record<string, unknown> }) => void): () => void;
      onAppServerRequest(listener: (request: { requestId: number | string; method: string; params: Record<string, unknown> }) => void): () => void;
    };
  }
}
