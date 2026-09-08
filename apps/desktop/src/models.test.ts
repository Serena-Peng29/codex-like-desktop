import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, isSupportedModelId, selectGatewayModel } from "./models.js";

describe("desktop model selection", () => {
  it("uses the configured product model when the gateway advertises it", () => {
    expect(selectGatewayModel(["text-moderation-stable", DEFAULT_MODEL_ID], DEFAULT_MODEL_ID)).toBe(DEFAULT_MODEL_ID);
  });

  it("falls back to an advertised product model instead of a non-chat model", () => {
    expect(selectGatewayModel(["text-moderation-stable", "gpt-5.6-terra"], "missing-model")).toBe("gpt-5.6-terra");
  });

  it("never treats moderation models as selectable product models", () => {
    expect(isSupportedModelId("text-moderation-stable")).toBe(false);
    expect(selectGatewayModel(["text-moderation-stable", DEFAULT_MODEL_ID], "text-moderation-stable")).toBe(DEFAULT_MODEL_ID);
  });
});
