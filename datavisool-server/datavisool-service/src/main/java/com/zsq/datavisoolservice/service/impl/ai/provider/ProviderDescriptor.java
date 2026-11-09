/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import java.util.Set;

/** 厂商元信息由策略声明，公共代码不维护厂商清单。 */
public record ProviderDescriptor(
        String key,
        Set<String> aliases,
        String defaultBaseUrl,
        boolean requiresApiKey,
        boolean fallbackToCompatibility
) {
    public ProviderDescriptor {
        aliases = aliases == null ? Set.of() : Set.copyOf(aliases);
    }
}
