/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.service.UserAgentConfigService;
import jakarta.annotation.Resource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/** Web 端 Agent 运行设置，按用户持久化并与桌面端字段保持一致。 */
@Service
public class AiAgentRuntimeSettingsService {
    private static final String CONFIG_KEY = "ai_driven_runtime_settings";

    @Resource
    private UserAgentConfigService userAgentConfigService;
    @Resource
    private ObjectMapper objectMapper;

    public RuntimeSettingsResponse get() {
        return new RuntimeSettingsResponse(load(currentUserId()), RuntimeSettings.defaults());
    }

    public RuntimeSettings save(JsonNode body) {
        Long userId = currentUserId();
        RuntimeSettings settings = normalize(body);
        validate(settings);
        try {
            userAgentConfigService.saveConfig(userId, CONFIG_KEY, objectMapper.writeValueAsString(settings));
        } catch (AppException e) {
            throw e;
        } catch (Exception e) {
            throw new AppException(500, "保存 AI 运行设置失败");
        }
        return settings;
    }

    /** 后台任务使用已经验证归属的用户 ID，不依赖请求线程的登录状态。 */
    public RuntimeSettings load(Long userId) {
        String stored = userAgentConfigService.getConfig(userId, CONFIG_KEY);
        if (stored == null) {
            return RuntimeSettings.defaults();
        }
        try {
            JsonNode body = objectMapper.readTree(stored);
            if (body == null || !body.isObject()) throw new IllegalArgumentException("配置必须是 JSON 对象");
            RuntimeSettings settings = normalize(body);
            validate(settings);
            return settings;
        } catch (AppException e) {
            throw new AppException(500, "已保存的 AI 运行设置无法读取：" + e.getMsg());
        } catch (Exception ignored) {
            throw new AppException(500, "已保存的 AI 运行设置无法读取，请检查个人配置");
        }
    }

    private Long currentUserId() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof User user) || user.getId() == null || user.getId() <= 0) {
            throw new AppException(AppStatusCode.UN_LOGGED_IN);
        }
        return user.getId();
    }

    private RuntimeSettings normalize(JsonNode body) {
        RuntimeSettings defaults = RuntimeSettings.defaults();
        JsonNode root = body == null || !body.isObject() ? objectMapper.createObjectNode() : body;
        JsonNode version = root.path("schemaVersion");
        if (!version.isIntegralNumber() || !version.canConvertToInt() || version.intValue() != 2)
            throw new AppException(400, "不支持的 AI 运行设置版本，仅支持版本 2");
        return new RuntimeSettings(
                2,
                new ModelRequest(
                        number(root, "modelRequest", "timeoutSeconds", defaults.modelRequest().timeoutSeconds())
                ),
                new Context(
                        number(root, "context", "maxActiveContextTokens", defaults.context().maxActiveContextTokens()),
                        number(root, "context", "compactAtPercent", defaults.context().compactAtPercent()),
                        number(root, "context", "maxToolResultTokens", defaults.context().maxToolResultTokens()),
                        number(root, "context", "maxToolHistoryTokens", Math.max(defaults.context().maxToolHistoryTokens(),
                                number(root, "context", "maxToolResultTokens", defaults.context().maxToolResultTokens()))),
                        number(root, "context", "maxStateDigestTokens", defaults.context().maxStateDigestTokens()),
                        number(root, "context", "compactSummaryTokens", defaults.context().compactSummaryTokens())
                ),
                new Execution(
                        toggle(root, "tokenBudgetEnabled", defaults.execution().tokenBudgetEnabled()),
                        toggle(root, "callBudgetEnabled", defaults.execution().callBudgetEnabled()),
                        toggle(root, "durationBudgetEnabled", defaults.execution().durationBudgetEnabled()),
                        number(root, "execution", "maxModelCalls", defaults.execution().maxModelCalls()),
                        number(root, "execution", "maxToolCalls", defaults.execution().maxToolCalls()),
                        number(root, "execution", "maxWriteCalls", defaults.execution().maxWriteCalls()),
                        number(root, "execution", "maxTotalTokens", defaults.execution().maxTotalTokens()),
                        number(root, "execution", "maxDurationSeconds", defaults.execution().maxDurationSeconds()),
                        number(root, "execution", "maxToolDurationSeconds", defaults.execution().maxToolDurationSeconds()),
                        number(root, "execution", "frontendBatchTimeoutSeconds", defaults.execution().frontendBatchTimeoutSeconds()),
                        number(root, "execution", "maxConsecutiveFailures", defaults.execution().maxConsecutiveFailures()),
                        number(root, "execution", "maxFrontendInteractions", defaults.execution().maxFrontendInteractions()),
                        number(root, "execution", "maxSameReadRepeats", defaults.execution().maxSameReadRepeats()),
                        number(root, "execution", "maxReadsWithoutBusinessProgress", defaults.execution().maxReadsWithoutBusinessProgress()),
                        number(root, "execution", "maxCompletionContinuations", defaults.execution().maxCompletionContinuations())
                )
        );
    }

    private boolean toggle(JsonNode root, String field, boolean fallback) {
        JsonNode value = root.path("execution").path(field);
        if (!value.isMissingNode() && !value.isBoolean()) throw new AppException(400, field + "必须是布尔值");
        return value.isBoolean() ? value.asBoolean() : fallback;
    }

    private long number(JsonNode root, String group, String field, long fallback) {
        JsonNode value = root.path(group).path(field);
        return value.isNumber() ? value.asLong() : fallback;
    }

    private void validate(RuntimeSettings settings) {
        range("模型请求超时", settings.modelRequest().timeoutSeconds(), 30, 3_600);
        range("活动上下文长度", settings.context().maxActiveContextTokens(), 4_096, 2_000_000);
        range("上下文压缩比例", settings.context().compactAtPercent(), 50, 95);
        range("工具结果 Token 上限", settings.context().maxToolResultTokens(), 512, 100_000);
        range("工具历史 Token 上限", settings.context().maxToolHistoryTokens(), 2_048, 1_000_000);
        range("状态摘要 Token 上限", settings.context().maxStateDigestTokens(), 512, 32_768);
        range("压缩摘要 Token 上限", settings.context().compactSummaryTokens(), 512, 32_768);
        if (settings.context().compactSummaryTokens() > settings.context().maxActiveContextTokens()) {
            throw new AppException(400, "压缩摘要 Token 上限不能超过活动上下文长度");
        }
        if (settings.context().maxToolResultTokens() > settings.context().maxActiveContextTokens()) {
            throw new AppException(400, "工具结果 Token 上限不能超过活动上下文长度");
        }
        if (settings.context().maxToolHistoryTokens() < settings.context().maxToolResultTokens()) {
            throw new AppException(400, "工具历史 Token 上限不能低于单个工具结果上限");
        }
        Execution execution = settings.execution();
        range("模型调用次数", execution.maxModelCalls(), 1, 1_000);
        range("工具调用次数", execution.maxToolCalls(), 1, 5_000);
        range("写入调用次数", execution.maxWriteCalls(), 1, 1_000);
        range("累计 Token 上限", execution.maxTotalTokens(), 10_000, 10_000_000);
        range("任务最长时间", execution.maxDurationSeconds(), 60, 86_400);
        range("单次工具最长时间", execution.maxToolDurationSeconds(), 1, 14_400);
        range("前端工具批次超时", execution.frontendBatchTimeoutSeconds(), 1, 14_400);
        range("连续失败次数", execution.maxConsecutiveFailures(), 1, 100);
        range("前端交互次数", execution.maxFrontendInteractions(), 1, 500);
        range("相同读取重复次数", execution.maxSameReadRepeats(), 1, 20);
        range("无业务进展读取次数", execution.maxReadsWithoutBusinessProgress(), 1, 100);
        range("完成续跑次数", execution.maxCompletionContinuations(), 1, 100);
        if (execution.maxWriteCalls() > execution.maxToolCalls()) {
            throw new AppException(400, "写入调用次数不能超过工具调用次数");
        }
        if (execution.durationBudgetEnabled() && execution.maxToolDurationSeconds() > execution.maxDurationSeconds()) {
            throw new AppException(400, "单次工具最长时间不能超过任务最长时间");
        }
        if (execution.durationBudgetEnabled() && execution.frontendBatchTimeoutSeconds() > execution.maxDurationSeconds()) {
            throw new AppException(400, "前端工具批次超时不能超过任务最长时间");
        }
    }

    private void range(String label, long value, long min, long max) {
        if (value < min || value > max) {
            throw new AppException(400, label + "必须在 " + min + " 到 " + max + " 之间");
        }
    }

    public record RuntimeSettingsResponse(RuntimeSettings settings, RuntimeSettings defaults) {
    }

    public record RuntimeSettings(int schemaVersion, ModelRequest modelRequest, Context context, Execution execution) {
        public RuntimeSettings(ModelRequest modelRequest, Context context, Execution execution) {
            this(2, modelRequest, context, execution);
        }
        public static RuntimeSettings defaults() {
            return new RuntimeSettings(
                    new ModelRequest(120),
                    new Context(128_000, 90, 10_000, 16_000, 4_096, 4_096),
                    new Execution(false, false, false, 120, 320, 120, 1_000_000, 4_500, 600, 120, 25, 40, 3, 20, 12)
            );
        }
    }

    public record ModelRequest(long timeoutSeconds) {
    }

    public record Context(long maxActiveContextTokens, long compactAtPercent, long maxToolResultTokens,
                          long maxToolHistoryTokens, long maxStateDigestTokens, long compactSummaryTokens) {
        public Context(long maxActiveContextTokens, long compactAtPercent, long maxToolResultTokens,
                       long compactSummaryTokens) {
            this(maxActiveContextTokens, compactAtPercent, maxToolResultTokens,
                    Math.max(16_000, maxToolResultTokens), 4_096, compactSummaryTokens);
        }
    }

    public record Execution(boolean tokenBudgetEnabled, boolean callBudgetEnabled, boolean durationBudgetEnabled,
                            long maxModelCalls, long maxToolCalls, long maxWriteCalls, long maxTotalTokens,
                            long maxDurationSeconds, long maxToolDurationSeconds, long frontendBatchTimeoutSeconds,
                            long maxConsecutiveFailures,
                            long maxFrontendInteractions, long maxSameReadRepeats,
                            long maxReadsWithoutBusinessProgress, long maxCompletionContinuations) {}
}
