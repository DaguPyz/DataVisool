/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** 自动收集策略 Bean；主键及别名重复时在启动阶段报错。 */
@Component
public final class AiModelProviderRegistry {
    private final Map<String, AiModelProviderStrategy> strategies;

    public AiModelProviderRegistry(List<AiModelProviderStrategy> providers) {
        Map<String, AiModelProviderStrategy> registered = new HashMap<>();
        for (AiModelProviderStrategy provider : providers) {
            ProviderDescriptor descriptor = provider.descriptor();
            register(registered, descriptor.key(), provider);
            for (String alias : descriptor.aliases()) register(registered, alias, provider);
        }
        strategies = Map.copyOf(registered);
    }

    public Optional<AiModelProviderStrategy> find(String key) {
        return Optional.ofNullable(strategies.get(normalize(key)));
    }

    private static void register(Map<String, AiModelProviderStrategy> registered, String key, AiModelProviderStrategy strategy) {
        String normalized = normalize(key);
        if (normalized.isEmpty()) throw new IllegalArgumentException("模型厂商标识不能为空");
        if (registered.putIfAbsent(normalized, strategy) != null) {
            throw new IllegalArgumentException("模型厂商标识或别名重复：" + normalized);
        }
    }

    private static String normalize(String key) { return key == null ? "" : key.trim().toLowerCase(Locale.ROOT); }
}
