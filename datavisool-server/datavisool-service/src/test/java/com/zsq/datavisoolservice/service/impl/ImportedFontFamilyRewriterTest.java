/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ImportedFontFamilyRewriterTest {
    private final Map<String, String> aliases = Map.of("demo font", "DV_123", "wide, display", "DV_456");

    @Test void rewritesDirectAndCssFallbackNamesWithoutChangingOtherFamilies() {
        assertEquals("DV_123", ImportedFontFamilyRewriter.rewrite("Demo Font", aliases));
        assertEquals("\"DV_123\", Arial, sans-serif",
                ImportedFontFamilyRewriter.rewrite("\"Demo Font\", Arial, sans-serif", aliases));
        assertEquals("'DV_456', serif",
                ImportedFontFamilyRewriter.rewrite("'Wide, Display', serif", aliases));
        assertEquals("\"DV_123\", serif", ImportedFontFamilyRewriter.rewrite("\"\\44 emo Font\", serif", aliases));
        assertEquals("var(--font), sans-serif", ImportedFontFamilyRewriter.rewrite("var(--font), sans-serif", aliases));
        assertEquals("\"Demo Font", ImportedFontFamilyRewriter.rewrite("\"Demo Font", aliases));
    }
}
