/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from "vitest";
import {
    getAiModelProviderOptions,
    isAiModelProviderSelectable,
    normalizeAiModelProviderId,
} from "../../src/util/ai-model-provider/AiModelProviderRegistry.ts";

describe("AI model provider registry", () => {
    it("matches the desktop provider catalog", () => {
        expect(getAiModelProviderOptions().map((item) => item.value)).toEqual([
            "openai",
            "qwen",
            "kimi",
            "glm",
            "minimax",
            "doubao",
            "hunyuan",
            "gemini",
            "grok",
            "deepseek",
            "mimo",
            "anthropic",
        ]);
        expect(getAiModelProviderOptions()).toHaveLength(12);
    });

    it("normalizes Xiaomi aliases to MiMo", () => {
        expect(normalizeAiModelProviderId("xiaomi")).toBe("mimo");
        expect(normalizeAiModelProviderId("xiaomi-mimo")).toBe("mimo");
    });

    it("only exposes providers supported by the AI driven model catalog", () => {
        expect(getAiModelProviderOptions().map((item) => item.value)).toEqual([
            "openai",
            "qwen",
            "kimi",
            "glm",
            "minimax",
            "doubao",
            "hunyuan",
            "gemini",
            "grok",
            "deepseek",
            "mimo",
            "anthropic",
        ]);
        expect(isAiModelProviderSelectable("ollama")).toBe(false);
        expect(isAiModelProviderSelectable("compatible")).toBe(false);
    });
});
