/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.util;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** 仅比较稳定的数字版本号，例如 1.2.3 或 v2026.8.20。 */
public final class VersionComparator {
    private static final Pattern VERSION_PATTERN = Pattern.compile("\\d+(?:\\.\\d+)*");

    private VersionComparator() {
    }

    public static String normalize(String version) {
        if (version == null) {
            return null;
        }
        String normalized = version.trim();
        if (normalized.startsWith("v") || normalized.startsWith("V")) {
            normalized = normalized.substring(1);
        }
        return VERSION_PATTERN.matcher(normalized).matches() ? normalized : null;
    }

    public static int compare(String leftVersion, String rightVersion) {
        String left = normalize(leftVersion);
        String right = normalize(rightVersion);
        if (left == null || right == null) {
            throw new IllegalArgumentException("版本号格式无效");
        }

        List<Integer> leftParts = parts(left);
        List<Integer> rightParts = parts(right);
        int size = Math.max(leftParts.size(), rightParts.size());
        for (int index = 0; index < size; index++) {
            int leftPart = index < leftParts.size() ? leftParts.get(index) : 0;
            int rightPart = index < rightParts.size() ? rightParts.get(index) : 0;
            int result = Integer.compare(leftPart, rightPart);
            if (result != 0) {
                return result;
            }
        }
        return 0;
    }

    private static List<Integer> parts(String version) {
        List<Integer> result = new ArrayList<>();
        for (String part : version.split("\\.")) {
            try {
                result.add(Integer.parseInt(part));
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException("版本号格式无效", exception);
            }
        }
        return result;
    }
}
