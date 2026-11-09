/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import java.util.Locale;
import java.util.Map;

/**
 * Replaces imported font family names while preserving CSS fallback lists.
 * Used by both current and legacy packages to resolve imported font conflicts.
 */
final class ImportedFontFamilyRewriter {
    private ImportedFontFamilyRewriter() {}

    static String rewrite(String value, Map<String, String> aliases) {
        if (value == null || aliases.isEmpty()) return value;
        String direct = aliases.get(value.toLowerCase(Locale.ROOT));
        if (direct != null) return direct;
        StringBuilder result = new StringBuilder();
        int start = 0;
        char quote = 0;
        boolean escaped = false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (escaped) {
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (quote != 0) {
                if (c == quote) quote = 0;
            } else if (c == '\'' || c == '"') {
                quote = c;
            } else if (c == ',') {
                result.append(rewriteToken(value.substring(start, i), aliases)).append(',');
                start = i + 1;
            }
        }
        if (quote != 0 || escaped) return value;
        return result.append(rewriteToken(value.substring(start), aliases)).toString();
    }

    private static String rewriteToken(String token, Map<String, String> aliases) {
        int start = 0, end = token.length();
        while (start < end && Character.isWhitespace(token.charAt(start))) start++;
        while (end > start && Character.isWhitespace(token.charAt(end - 1))) end--;
        String trimmed = token.substring(start, end);
        if (trimmed.isEmpty()) return token;
        char first = trimmed.charAt(0);
        boolean quoted = (first == '\'' || first == '"') && trimmed.length() >= 2
                && trimmed.charAt(trimmed.length() - 1) == first;
        String body = quoted ? trimmed.substring(1, trimmed.length() - 1) : trimmed;
        if (!quoted && (body.indexOf('"') >= 0 || body.indexOf('\'') >= 0 || body.indexOf('(') >= 0 || body.indexOf(')') >= 0)) return token;
        String name = decodeCssEscapes(body);
        String alias = aliases.get(name.toLowerCase(Locale.ROOT));
        if (alias == null) return token;
        return token.substring(0, start) + (quoted ? first + alias + first : alias) + token.substring(end);
    }

    private static String decodeCssEscapes(String value) {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c != '\\' || i + 1 == value.length()) {
                result.append(c);
                continue;
            }
            int begin = i + 1, end = begin;
            while (end < value.length() && end - begin < 6 && Character.digit(value.charAt(end), 16) >= 0) end++;
            if (end == begin) {
                result.append(value.charAt(++i));
                continue;
            }
            int codePoint = Integer.parseInt(value.substring(begin, end), 16);
            if (codePoint == 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) codePoint = 0xfffd;
            result.appendCodePoint(codePoint);
            if (end < value.length() && Character.isWhitespace(value.charAt(end))) end++;
            i = end - 1;
        }
        return result.toString();
    }
}
