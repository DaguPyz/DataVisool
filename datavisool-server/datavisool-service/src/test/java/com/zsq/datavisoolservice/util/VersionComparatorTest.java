/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VersionComparatorTest {

    @Test
    void comparesNumericVersionPartsInsteadOfStrings() {
        assertTrue(VersionComparator.compare("1.10.0", "1.9.9") > 0);
        assertEquals(0, VersionComparator.compare("v2026.8.0", "2026.8"));
        assertTrue(VersionComparator.compare("2026.8.20", "2026.7.0") > 0);
    }

    @Test
    void rejectsUnsupportedVersionFormat() {
        assertNull(VersionComparator.normalize("2026.8.0-beta"));
        assertNull(VersionComparator.normalize("latest"));
    }
}
