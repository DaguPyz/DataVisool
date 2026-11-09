/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.config;

import org.junit.Assert;
import org.junit.Test;
import org.springframework.web.cors.CorsConfiguration;

import java.util.List;

public class SecurityCorsSupportTest {

    @Test
    public void parseAllowedOriginPatternsTrimsDeduplicatesAndSkipsEmptyValues() {
        List<String> patterns = SecurityCorsSupport.parseAllowedOriginPatterns(
                " http://127.0.0.1:5173, http://localhost:5173 ,, http://127.0.0.1:5173 ");

        Assert.assertEquals(List.of("http://127.0.0.1:5173", "http://localhost:5173"), patterns);
    }

    @Test
    public void buildCorsConfigurationReturnsNullWhenNoOriginsAreConfigured() {
        Assert.assertNull(SecurityCorsSupport.buildCorsConfiguration(List.of()));
    }

    @Test
    public void buildCorsConfigurationUsesRestrictedDefaults() {
        CorsConfiguration config = SecurityCorsSupport.buildCorsConfiguration(List.of("http://localhost:5173"));

        Assert.assertNotNull(config);
        Assert.assertEquals(List.of("http://localhost:5173"), config.getAllowedOriginPatterns());
        Assert.assertEquals(Boolean.FALSE, config.getAllowCredentials());
        Assert.assertTrue(config.getAllowedMethods().contains("GET"));
        Assert.assertTrue(config.getAllowedMethods().contains("OPTIONS"));
        Assert.assertTrue(config.getExposedHeaders().contains("Content-Disposition"));
    }
}
