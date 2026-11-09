/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.global.AppException;

import java.util.LinkedHashMap;
import java.util.Map;
import dev.langchain4j.model.output.TokenUsage;
import dev.langchain4j.model.openai.OpenAiTokenUsage;
import dev.langchain4j.model.anthropic.AnthropicTokenUsage;
import com.zsq.datavisoolservice.service.impl.ai.provider.AiProviderTokenUsage;

/** 每轮任务的累计授权和用量；恢复及前端交互后的续跑均不重置。 */
final class AiAgentBudget {
    private static final Map<String, String> USAGE_KEYS = Map.of(
            "maxTotalTokens", "totalTokens", "maxModelCalls", "modelCalls", "maxToolCalls", "toolCalls",
            "maxWriteCalls", "writeCalls", "maxFrontendInteractions", "frontendInteractions", "maxDurationMs", "elapsedMs");
    private static final Map<String, Long> MAX_LIMITS = Map.of(
            "maxTotalTokens", 10_000_000L, "maxModelCalls", 1_000L, "maxToolCalls", 5_000L,
            "maxWriteCalls", 1_000L, "maxFrontendInteractions", 500L, "maxDurationMs", 86_400_000L);
    private final Map<String, Object> limits;
    private final Map<String, Object> usage;
    private final long startedNanos = System.nanoTime();
    private final long previousElapsedMs;

    AiAgentBudget(Map<String, Object> limits, Map<String, Object> usage) {
        this.limits = new LinkedHashMap<>(limits);
        this.usage = new LinkedHashMap<>(usage);
        this.usage.putIfAbsent("inputTokens", 0L);
        this.usage.putIfAbsent("outputTokens", 0L);
        this.usage.putIfAbsent("totalTokens", number(usage, "inputTokens") + number(usage, "outputTokens"));
        this.usage.putIfAbsent("contextInputTokens", number(usage, "inputTokens"));
        previousElapsedMs = number(usage, "elapsedMs");
    }

    static Map<String, Object> limits(AiAgentRuntimeSettingsService.Execution settings) {
        Map<String, Object> limits = new LinkedHashMap<>();
        limits.put("tokenBudgetEnabled", settings.tokenBudgetEnabled());
        limits.put("callBudgetEnabled", settings.callBudgetEnabled());
        limits.put("durationBudgetEnabled", settings.durationBudgetEnabled());
        limits.put("maxTotalTokens", settings.maxTotalTokens());
        limits.put("maxModelCalls", settings.maxModelCalls());
        limits.put("maxToolCalls", settings.maxToolCalls());
        limits.put("maxWriteCalls", settings.maxWriteCalls());
        limits.put("maxFrontendInteractions", settings.maxFrontendInteractions());
        limits.put("maxDurationMs", settings.maxDurationSeconds() * 1_000L);
        return limits;
    }

    static Map<String, Object> extend(Map<String, Object> limits, Map<String, Object> usage,
                                      Map<String, Object> extension, boolean required) {
        if (extension == null || extension.isEmpty()) {
            if (required) throw new AppException(400, "请至少增加一项预算后继续");
            return new LinkedHashMap<>(limits);
        }
        Map<String, Object> result = new LinkedHashMap<>(limits);
        extension.forEach((key, value) -> {
            if (!USAGE_KEYS.containsKey(key) || !(value instanceof Number n)
                    || !Double.isFinite(n.doubleValue()) || n.doubleValue() != n.longValue()
                    || n.longValue() <= Math.max(number(limits, key), number(usage, USAGE_KEYS.get(key)))
                    || n.longValue() > MAX_LIMITS.get(key)) {
                throw new AppException(400, "新的累计预算必须高于当前上限和已用量，并在允许范围内：" + key);
            }
            result.put(key, n.longValue());
        });
        if (number(result, "maxWriteCalls") > number(result, "maxToolCalls")) {
            throw new AppException(400, "写入调用上限不能超过工具调用上限");
        }
        return result;
    }

    void reserveModelCall() {
        checkTime();
        check("maxModelCalls", number(usage, "modelCalls") + 1, "模型调用预算已用尽");
        check("maxTotalTokens", number(usage, "totalTokens") + 1, "累计 Token 预算已用尽");
        increment("modelCalls");
    }

    void checkToolBatch(long tools, long writes, long interactions) {
        checkTime();
        check("maxToolCalls", number(usage, "toolCalls") + tools, "工具调用预算已用尽");
        check("maxWriteCalls", number(usage, "writeCalls") + writes, "写入调用预算已用尽");
        check("maxFrontendInteractions", number(usage, "frontendInteractions") + interactions, "前端交互预算已用尽");
    }

    void recordTool(boolean write, boolean frontend) {
        increment("toolCalls");
        if (write) increment("writeCalls");
        if (frontend) increment("frontendInteractions");
    }

    void recordFrontendInteraction() { increment("frontendInteractions"); }
    long recordToolOutcome(String status) {
        if (failedStatus(status)) increment("consecutiveFailures");
        else if (java.util.Set.of("applied", "completed", "appended").contains(status)) metadata("consecutiveFailures", 0L);
        return number(usage, "consecutiveFailures");
    }
    static boolean failedStatus(String status) { return java.util.Set.of("failed", "rejected", "declined").contains(status); }

    void addTokens(long input, long output) {
        addTokens(input, output, input + output);
    }
    private void addTokens(long input, long output, long total) {
        usage.put("inputTokens", number(usage, "inputTokens") + input);
        usage.put("outputTokens", number(usage, "outputTokens") + output);
        usage.put("totalTokens", number(usage, "totalTokens") + total);
    }
    long addUsage(TokenUsage reported, long estimatedInput, long estimatedOutput) {
        long input = reported != null && reported.inputTokenCount() != null ? reported.inputTokenCount() : estimatedInput;
        long output = reported != null && reported.outputTokenCount() != null ? reported.outputTokenCount() : estimatedOutput;
        Long cached = null, created = null;
        if (reported instanceof OpenAiTokenUsage openai && openai.inputTokensDetails() != null)
            cached = count(openai.inputTokensDetails().cachedTokens());
        else if (reported instanceof AnthropicTokenUsage anthropic) {
            cached = count(anthropic.cacheReadInputTokens()); created = count(anthropic.cacheCreationInputTokens());
        } else if (reported instanceof AiProviderTokenUsage nativeUsage) {
            cached = count(nativeUsage.cachedInputTokens()); created = count(nativeUsage.cacheCreationInputTokens());
        }
        long total = reported != null && reported.totalTokenCount() != null && reported.totalTokenCount() > 0
                ? reported.totalTokenCount() : input + output;
        // LangChain4j 的 Anthropic total 不含缓存；与桌面 Rig 一样把缓存计入总量和上下文，保留原始 input。
        if (reported instanceof AnthropicTokenUsage)
            total = input + output + (cached == null ? 0 : cached) + (created == null ? 0 : created);
        long context = Math.max(0, total - output);
        addTokens(input, output, total);
        addCachedTokens(cached, created);
        usage.put("contextInputTokens", number(usage, "contextInputTokens") + context);
        metadata("usageEstimated", reported == null || reported.inputTokenCount() == null || reported.outputTokenCount() == null);
        return context;
    }
    private static Long count(Integer value) { return value == null ? null : Math.max(0L, value.longValue()); }

    void checkTokens() {
        check("maxTotalTokens", number(usage, "totalTokens"), "累计 Token 预算已用尽");
    }

    void checkTime() {
        check("maxDurationMs", elapsedMs() + 1, "任务时长预算已用尽");
    }

    Map<String, Object> snapshot() {
        Map<String, Object> snapshot = publicUsage(persistedSnapshot());
        for (String flag : java.util.List.of("tokenBudgetEnabled", "callBudgetEnabled", "durationBudgetEnabled"))
            snapshot.put(flag, enabled(flag));
        USAGE_KEYS.forEach((limit, used) -> snapshot.put("remaining" + limit.substring(3),
                enabled(flagFor(limit)) ? Math.max(0, number(limits, limit) - number(snapshot, used)) : null));
        return snapshot;
    }

    Map<String, Object> persistedSnapshot() {
        Map<String, Object> snapshot = new LinkedHashMap<>(usage);
        snapshot.put("elapsedMs", elapsedMs());
        return snapshot;
    }

    static Map<String, Object> publicUsage(Map<String, Object> persisted) {
        Map<String, Object> result = new LinkedHashMap<>(persisted);
        result.remove("_toolGuardState");
        result.remove("_compactionTokenBaseline");
        return result;
    }

    void metadata(String key, Object value) { usage.put(key, value); }
    void addCachedTokens(Long cached, Long created) {
        if (cached != null) usage.put("cachedInputTokens", number(usage, "cachedInputTokens") + cached);
        if (created != null) usage.put("cacheCreationInputTokens", number(usage, "cacheCreationInputTokens") + created);
    }
    void context(long tokens, long capacity, String source) {
        metadata("activeContextTokens", tokens);
        metadata("contextCapacityTokens", capacity);
        metadata("contextCapacitySource", source);
    }
    long tokensSinceCompaction() {
        return Math.max(0, number(usage, "totalTokens") - number(usage, "_compactionTokenBaseline"));
    }
    void compacted(long before, long after) {
        increment("compactionCount");
        metadata("compactionBeforeTokens", before);
        metadata("compactionAfterTokens", after);
        metadata("_compactionTokenBaseline", number(usage, "totalTokens"));
    }

    private long elapsedMs() {
        return previousElapsedMs + (System.nanoTime() - startedNanos) / 1_000_000L;
    }

    private void increment(String key) {
        usage.put(key, number(usage, key) + 1);
    }

    private void check(String key, long next, String message) {
        if (enabled(flagFor(key)) && next > number(limits, key)) throw new Exhausted(message);
    }

    private boolean enabled(String flag) {
        Object value = limits.get(flag);
        if (!(value instanceof Boolean enabled)) throw new AppException(409, "AI 任务预算格式不受支持");
        return enabled;
    }
    private static String flagFor(String key) {
        return "maxTotalTokens".equals(key) ? "tokenBudgetEnabled"
                : "maxDurationMs".equals(key) ? "durationBudgetEnabled" : "callBudgetEnabled";
    }

    static long number(Map<String, Object> values, String key) {
        Object value = values.get(key);
        return value instanceof Number n ? Math.max(0, n.longValue()) : 0;
    }

    static final class Exhausted extends RuntimeException {
        Exhausted(String message) { super(message); }
    }
}
