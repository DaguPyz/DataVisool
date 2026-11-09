/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

/** 通用路径处理，厂商所需后缀由独立策略提供。 */
public final class AiProviderEndpoints {
    private AiProviderEndpoints() { }

    public static String chatCompletionsBase(String baseUrl) {
        return stripSuffixes(baseUrl, "/responses", "/chat/completions");
    }

    public static String stripSuffixes(String baseUrl, String... suffixes) {
        String base = baseUrl.trim().replaceAll("/+$", "");
        for (String suffix : suffixes) {
            if (base.endsWith(suffix)) base = base.substring(0, base.length() - suffix.length());
        }
        return base;
    }

    static int tokenLimit(long value) { return (int) Math.min(Integer.MAX_VALUE, Math.max(1L, value)); }
}
