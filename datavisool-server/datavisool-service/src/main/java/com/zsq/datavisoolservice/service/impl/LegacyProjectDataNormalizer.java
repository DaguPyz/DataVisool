/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Converts known legacy project configuration at the import boundary.
 *
 * @deprecated Temporary compatibility for legacy project packages.
 */
// TODO(legacy-compat): Remove this normalizer and its import call when legacy project data is no longer supported.
@Deprecated(forRemoval = true)
final class LegacyProjectDataNormalizer {
    private LegacyProjectDataNormalizer() {}

    static void normalize(Object value) {
        if (value instanceof JSONArray array) {
            array.forEach(LegacyProjectDataNormalizer::normalize);
            return;
        }
        if (!(value instanceof JSONObject object)) return;

        // TODO(legacy-compat): Remove the unwrapped staticData conversion when those imported projects are no longer supported.
        if (object.get("sourceType") instanceof String && object.get("staticData") != null) {
            Object old = object.get("staticData");
            if (!(old instanceof JSONObject data) || !data.containsKey("value")) {
                JSONObject wrapped = new JSONObject();
                wrapped.put("value", old);
                object.put("staticData", wrapped);
            }
        }

        if (object.get("base") instanceof JSONObject base && object.get("style") instanceof JSONObject style) {
            String type = base.getString("type");
            // TODO(legacy-compat): Remove old gap and table option mappings when the corresponding project formats are retired.
            if ("LoopContainer".equals(type) && style.containsKey("gap")) {
                Object gap = style.remove("gap");
                if (style.get("horizontalGap") == null) style.put("horizontalGap", gap);
                if (style.get("verticalGap") == null) style.put("verticalGap", gap);
            } else if ("LcBaseTable".equals(type) && style.get("body") instanceof JSONObject body) {
                moveTableOption(body, "enableCarousel", true, "autoScroll", "enableScroll", "enableInfiniteScroll", "infiniteScroll");
                moveTableOption(body, "carouselSpeed", false, "scrollSpeed", "speed");
                moveTableOption(body, "carouselPauseSeconds", false, "scrollPauseSeconds", "pauseSeconds");
            }
        }

        for (Map.Entry<String, Object> entry : object.entrySet()) {
            // User-provided data can contain arbitrary objects with configuration-like keys.
            if (!"value".equals(entry.getKey()) && !"staticData".equals(entry.getKey())) normalize(entry.getValue());
        }
    }

    private static void moveTableOption(JSONObject body, String target, boolean isBoolean, String... oldNames) {
        if (body.get(target) == null) {
            for (String oldName : oldNames) {
                Object old = body.get(oldName);
                if (old == null) continue;
                body.put(target, isBoolean ? toBoolean(old) : toNumberIfPossible(old));
                break;
            }
        }
        for (String oldName : oldNames) body.remove(oldName);
    }

    private static boolean toBoolean(Object value) {
        return Boolean.TRUE.equals(value) || "true".equals(value) || "1".equals(value)
                || (value instanceof Number && new BigDecimal(value.toString()).compareTo(BigDecimal.ONE) == 0);
    }

    private static Object toNumberIfPossible(Object value) {
        if (value instanceof Number) return value;
        if (value instanceof String string) {
            try {
                return new BigDecimal(string);
            } catch (NumberFormatException ignored) {
                // Preserve an unrecognized value for the user to inspect.
            }
        }
        return value;
    }
}
