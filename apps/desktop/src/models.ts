export const DEFAULT_MODEL_ID = "gpt-5.6-sol";

export const modelOptions = [
  { id: "gpt-6-astra", label: "6 Astra" },
  { id: DEFAULT_MODEL_ID, label: "5.6 Sol" },
  { id: "gpt-5.6-terra", label: "5.6 Terra" },
  { id: "gpt-5.6-luna", label: "5.6 Luna" },
  { id: "gpt-5.5", label: "5.5" }
] as const;

export type SupportedModelId = typeof modelOptions[number]["id"];
export type ChatStreamOptions = { effort?: string; planMode?: boolean; model?: SupportedModelId };

export function isSupportedModelId(value: unknown): value is SupportedModelId {
  return typeof value === "string" && modelOptions.some((option) => option.id === value);
}

export function selectGatewayModel(availableModels: string[], preferredModel = DEFAULT_MODEL_ID): string {
  const preferred = isSupportedModelId(preferredModel.trim()) ? preferredModel.trim() : DEFAULT_MODEL_ID;
  if (!availableModels.length || availableModels.includes(preferred)) return preferred;
  return availableModels.find(isSupportedModelId) ?? preferred;
}
