/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config;

import org.springframework.web.cors.CorsConfiguration;

import java.util.Arrays;
import java.util.List;

public final class SecurityCorsSupport {

    private static final List<String> ALLOWED_METHODS = List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD");
    private static final List<String> ALLOWED_HEADERS = List.of("*");
    private static final List<String> EXPOSED_HEADERS = List.of("Content-Disposition");

    private SecurityCorsSupport() {
    }

    public static List<String> parseAllowedOriginPatterns(String rawPatterns) {
        if (rawPatterns == null || rawPatterns.isBlank()) {
            return List.of();
        }
        return Arrays.stream(rawPatterns.split(","))
                .map(String::trim)
                .filter(pattern -> !pattern.isEmpty())
                .distinct()
                .toList();
    }

    public static CorsConfiguration buildCorsConfiguration(List<String> allowedOriginPatterns) {
        if (allowedOriginPatterns == null || allowedOriginPatterns.isEmpty()) {
            return null;
        }
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(allowedOriginPatterns);
        config.setAllowedMethods(ALLOWED_METHODS);
        config.setAllowedHeaders(ALLOWED_HEADERS);
        config.setExposedHeaders(EXPOSED_HEADERS);
        config.setAllowCredentials(false);
        config.setMaxAge(1800L);
        return config;
    }
}
