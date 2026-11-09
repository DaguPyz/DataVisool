/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {getAiDrivenRuntimeSettings, saveAiDrivenRuntimeSettings} from "@/api/AiDrivenSettingsApi.ts";

const fetch = vi.hoisted(() => ({getOrThrow: vi.fn(), post: vi.fn()}));
vi.mock("@/util/AuthFetchUtil.ts", () => ({default: fetch}));

describe("AI personal settings", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        });
        fetch.getOrThrow.mockResolvedValue({settings: {schemaVersion: 2}, defaults: {schemaVersion: 2}});
    });
    afterEach(() => vi.unstubAllGlobals());

    test("version 2 settings retain values and receive context defaults", async () => {
        fetch.getOrThrow.mockResolvedValue({settings: {
            schemaVersion: 2, context: {maxActiveContextTokens: 64_000, compactAtPercent: 75, maxToolResultTokens: 50_000},
        }, defaults: {schemaVersion: 2}});
        const response = await getAiDrivenRuntimeSettings();
        expect(response.settings.context).toMatchObject({maxActiveContextTokens: 64_000, compactAtPercent: 75,
            maxToolHistoryTokens: 50_000, maxStateDigestTokens: 4096});
    });

    test("partial version 2 responses receive context defaults", async () => {
        fetch.getOrThrow.mockResolvedValue({settings: {schemaVersion: 2, context: {compactAtPercent: 70}}, defaults: {schemaVersion: 2, context: {compactAtPercent: 90}}});
        const response = await getAiDrivenRuntimeSettings();
        expect(response.settings.context).toMatchObject({compactAtPercent: 70, maxToolHistoryTokens: 16_000, maxStateDigestTokens: 4096});
        expect(response.defaults.context.maxStateDigestTokens).toBe(4096);
    });

    test("save uses the server response and does not write a shared browser cache", async () => {
        const {settings} = await getAiDrivenRuntimeSettings();
        settings.context.maxToolHistoryTokens = 32_000;
        settings.context.maxStateDigestTokens = 8_192;
        fetch.post.mockResolvedValue({...settings, modelRequest: {timeoutSeconds: 300}});
        const saved = await saveAiDrivenRuntimeSettings(settings);
        expect(fetch.post).toHaveBeenCalledWith("/api/aiDriven/settings/save", settings, undefined);
        expect(saved.context).toMatchObject({maxToolHistoryTokens: 32_000, maxStateDigestTokens: 8192});
        expect(saved.modelRequest.timeoutSeconds).toBe(300);
        expect(localStorage.getItem("AI_DRIVEN_RUNTIME_SETTINGS_V1")).toBeNull();
    });

    test("fresh budgets default off and retain independent switches on save", async () => {
        const {settings} = await getAiDrivenRuntimeSettings();
        expect(settings.execution).toMatchObject({tokenBudgetEnabled: false, callBudgetEnabled: false, durationBudgetEnabled: false});
        settings.execution.callBudgetEnabled = true;
        fetch.post.mockResolvedValue(settings);
        expect((await saveAiDrivenRuntimeSettings(settings)).execution)
            .toMatchObject({tokenBudgetEnabled: false, callBudgetEnabled: true, durationBudgetEnabled: false});
    });

    test("rejects version 1, missing and unsupported versions without applying defaults", async () => {
        for (const version of [1, undefined, 3]) {
            fetch.getOrThrow.mockResolvedValue({settings: {schemaVersion: version, execution: {maxModelCalls: 9}},
                defaults: {schemaVersion: 2}});
            await expect(getAiDrivenRuntimeSettings()).rejects.toThrow("仅支持版本 2");
        }
        fetch.getOrThrow.mockResolvedValue({settings: {schemaVersion: 2}, defaults: {schemaVersion: 1}});
        await expect(getAiDrivenRuntimeSettings()).rejects.toThrow("仅支持版本 2");
        fetch.post.mockResolvedValue({schemaVersion: 1});
        await expect(saveAiDrivenRuntimeSettings({schemaVersion: 2} as any)).rejects.toThrow("仅支持版本 2");
    });

    test("account changes read each account from the server and ignore the previous shared cache", async () => {
        localStorage.setItem("AI_DRIVEN_RUNTIME_SETTINGS_V1", JSON.stringify({modelRequest: {timeoutSeconds: 999}}));
        fetch.getOrThrow.mockResolvedValueOnce({settings: {schemaVersion: 2, modelRequest: {timeoutSeconds: 300}}, defaults: {schemaVersion: 2}})
            .mockResolvedValueOnce({settings: {schemaVersion: 2, modelRequest: {timeoutSeconds: 600}}, defaults: {schemaVersion: 2}});
        expect((await getAiDrivenRuntimeSettings()).settings.modelRequest.timeoutSeconds).toBe(300);
        expect((await getAiDrivenRuntimeSettings()).settings.modelRequest.timeoutSeconds).toBe(600);
        fetch.getOrThrow.mockResolvedValue(null);
        await expect(getAiDrivenRuntimeSettings()).rejects.toThrow("读取 AI 运行设置失败");
    });

    test("failed reads and saves cannot appear successful using defaults or local settings", async () => {
        const {settings} = await getAiDrivenRuntimeSettings();
        fetch.post.mockResolvedValue(null);
        await expect(saveAiDrivenRuntimeSettings(settings)).rejects.toThrow("保存 AI 运行设置失败");
        expect(localStorage.getItem("AI_DRIVEN_RUNTIME_SETTINGS_V1")).toBeNull();
        fetch.getOrThrow.mockResolvedValue({settings});
        await expect(getAiDrivenRuntimeSettings()).rejects.toThrow("读取 AI 运行设置失败");
        fetch.getOrThrow.mockRejectedValue(new Error("offline"));
        await expect(getAiDrivenRuntimeSettings()).rejects.toThrow("offline");
    });
});
