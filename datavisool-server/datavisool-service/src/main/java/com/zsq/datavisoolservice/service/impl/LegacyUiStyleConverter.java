/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Applies exact published UI token mappings while preserving CSS text and URLs.
 *
 * @deprecated Temporary compatibility for legacy component UI styles.
 */
// TODO(legacy-compat): Remove this converter and its style map when legacy component styles are no longer supported.
@Deprecated(forRemoval = true)
final class LegacyUiStyleConverter {
    private static final Properties MAPPINGS = loadMappings();
    private static final Pattern EXACT_CLASS_SELECTOR = Pattern.compile("(?s)^\\[\\s*class\\s*(=|~=)\\s*(?:(['\"])((?:\\\\.|[^\\\\])*)\\2|((?:\\\\[0-9a-fA-F]{1,6}[\\t\\n\\r\\f ]?|\\\\[^\\r\\n\\f]|[^\\s\\]\\\"'])+))\\s*([sS]?)\\s*\\]$");
    private static final Pattern JS_UNICODE_ESCAPE = Pattern.compile("\\\\u(?:([0-9a-fA-F]{4})|\\{([0-9a-fA-F]{1,6})\\})");

    private LegacyUiStyleConverter() {}

    static Properties mappings() {
        Properties copy = new Properties();
        copy.putAll(MAPPINGS);
        return copy;
    }

    /**
     * Cheap import prefilter for CSS identifiers whose legacy prefix is hidden by CSS escapes.
     * Ordinary JavaScript escapes do not trigger script parsing unless a CSS token decodes to a
     * known legacy prefix.
     */
    static boolean containsLegacyStyleCandidate(String text) {
        String searchable = normalizeSearchEscapes(text);
        for (int i = 0; i < searchable.length(); i++) {
            int start = -1;
            if (searchable.charAt(i) == '.' && i + 1 < searchable.length() && isCssNameStart(searchable.charAt(i + 1))) {
                start = i + 1;
            } else if (searchable.startsWith("--", i) && i + 2 < searchable.length() && isCssNameStart(searchable.charAt(i + 2))) {
                start = i;
            }
            if (start < 0) continue;
            int end = cssSearchNameEnd(searchable, start);
            String raw = searchable.substring(start, end);
            i = Math.max(i, end - 1);
            try {
                String name = decodeCssEscapes(raw, "");
                if (isLegacyClassToken(name) || MAPPINGS.containsKey(name)) return true;
            } catch (IllegalArgumentException ignored) {
                // Invalid/non-CSS escapes are not enough evidence to parse an arbitrary script.
            }
        }
        if (containsLegacyClassAttribute(searchable)) return true;
        return containsLegacyClassNameCandidate(searchable);
    }

    private static final Pattern CLASS_ATTRIBUTE = Pattern.compile("(?is)^\\[\\s*class\\s*(?:~=|=|\\*=|\\^=|\\$=|\\|=).*");
    private static final Pattern CLASS_NAME_TOKEN = Pattern.compile("[a-zA-Z_][a-zA-Z0-9_-]*");

    private static boolean containsLegacyClassAttribute(String source) {
        for (int i = 0; i < source.length(); i++) {
            if (source.charAt(i) != '[') continue;
            if (containsObfuscatedLegacyClassAttribute(source, i)) return true;
            int selectorStart = i + 1;
            while (selectorStart < source.length()) {
                if (isCssWhitespace(source.charAt(selectorStart))) { selectorStart++; continue; }
                if (source.startsWith("/*", selectorStart)) {
                    int commentEnd = source.indexOf("*/", selectorStart + 2);
                    if (commentEnd < 0) return true;
                    selectorStart = commentEnd + 2;
                    continue;
                }
                break;
            }
            boolean literalClassAttribute = source.startsWith("class", selectorStart)
                    && (selectorStart + 5 >= source.length() || !isNameChar(source.charAt(selectorStart + 5)));
            if (!literalClassAttribute) {
                if (!hasEscapedClassAttributeName(source, i)) {
                    i = selectorStart - 1;
                    continue;
                }
                try {
                    String selector = source.substring(i, attributeEnd(source, i, ""));
                    if (normalizeEscapedClassAttributeName(selector, "").equals(selector)) {
                        i = selectorStart - 1;
                        continue;
                    }
                } catch (IllegalArgumentException ignored) {
                    // Once an escaped `class` key is confirmed, an unclosed attribute is ambiguous.
                    return true;
                }
            }
            try {
                int end = attributeEnd(source, i, "");
                String selector = source.substring(i, end);
                String normalizedSelector = normalizeEscapedClassAttributeName(selector, "");
                if (CLASS_ATTRIBUTE.matcher(maskCssComments(normalizedSelector, "")).matches()) {
                    String decoded = decodeCssEscapes(selector, "");
                    if (containsLegacyStylePrefix(decoded) || containsMappedClassToken(decoded)) return true;
                }
                i = end - 1;
            } catch (IllegalArgumentException ignored) {
                // A malformed class selector is ambiguous and must not pass import silently.
                return true;
            }
        }
        return false;
    }

    /** Avoid scanning the rest of arbitrary JavaScript bracket expressions unless the key is a CSS class key. */
    private static boolean hasEscapedClassAttributeName(String source, int bracketStart) {
        int nameStart = bracketStart + 1;
        while (nameStart < source.length()) {
            if (isCssWhitespace(source.charAt(nameStart))) { nameStart++; continue; }
            if (source.startsWith("/*", nameStart)) {
                int commentEnd = source.indexOf("*/", nameStart + 2);
                if (commentEnd < 0) return false;
                nameStart = commentEnd + 2;
                continue;
            }
            break;
        }
        if (nameStart >= source.length() || !(isNameChar(source.charAt(nameStart)) || source.charAt(nameStart) == '\\'))
            return false;
        try {
            int nameEnd = cssNameEnd(source, nameStart, "");
            String rawName = source.substring(nameStart, nameEnd);
            return rawName.indexOf('\\') >= 0 && "class".equals(decodeCssEscapes(rawName, ""));
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    /** Detects inline CSS class attribute names obscured by comments or CSS escapes. */
    private static boolean containsObfuscatedLegacyClassAttribute(String source, int start) {
        int index = start + 1;
        while (index < source.length()) {
            if (isCssWhitespace(source.charAt(index))) { index++; continue; }
            if (source.startsWith("/*", index)) {
                int commentEnd = source.indexOf("*/", index + 2);
                if (commentEnd < 0) return false;
                index = commentEnd + 2;
                continue;
            }
            break;
        }
        StringBuilder name = new StringBuilder();
        boolean hasEscape = false;
        boolean commentInsideName = false;
        while (index < source.length()) {
            if (isNameChar(source.charAt(index))) {
                name.append(source.charAt(index++));
                continue;
            }
            if (source.charAt(index) == '\\') {
                int escapeEnd;
                try {
                    escapeEnd = cssEscapeEnd(source, index, "");
                } catch (IllegalArgumentException ignored) {
                    return false;
                }
                name.append(source, index, escapeEnd);
                hasEscape = true;
                index = escapeEnd;
                continue;
            }
            if (source.startsWith("/*", index)) {
                int commentEnd = source.indexOf("*/", index + 2);
                if (commentEnd < 0) {
                    String partial = decodeCssEscapes(name.toString(), "").toLowerCase(Locale.ROOT);
                    return (hasEscape || partial.equals("class") || "class".startsWith(partial))
                            && containsLegacyStylePrefix(source.substring(start));
                }
                int afterComment = commentEnd + 2;
                if (name.length() > 0 && afterComment < source.length()
                        && (isNameChar(source.charAt(afterComment)) || source.charAt(afterComment) == '\\')) {
                    commentInsideName = true;
                }
                index = commentEnd + 2;
                if (!commentInsideName) break;
                continue;
            }
            break;
        }
        if ((!hasEscape && !commentInsideName) || !"class".equals(decodeCssEscapes(name.toString(), ""))) return false;
        while (index < source.length()) {
            if (isCssWhitespace(source.charAt(index))) { index++; continue; }
            if (source.startsWith("/*", index)) {
                int commentEnd = source.indexOf("*/", index + 2);
                if (commentEnd < 0) return true;
                index = commentEnd + 2;
                continue;
            }
            break;
        }
        if (!(source.startsWith("~=", index) || source.startsWith("*=", index) || source.startsWith("^=", index)
                || source.startsWith("$=", index) || source.startsWith("|=", index)
                || index < source.length() && source.charAt(index) == '=')) return false;
        try {
            int end = attributeEnd(source, start, "");
            return containsLegacyStylePrefix(decodeCssEscapes(source.substring(start, end), ""));
        } catch (IllegalArgumentException ignored) {
            return true;
        }
    }

    private static boolean containsMappedClassToken(String value) {
        Matcher token = CLASS_NAME_TOKEN.matcher(value);
        while (token.find()) if (MAPPINGS.containsKey(token.group())) return true;
        return false;
    }

    private static boolean containsLegacyClassNameCandidate(String source) {
        for (int index = 0; index < source.length();) {
            char current = source.charAt(index);
            if (current == '\'' || current == '"' || current == '`') {
                // A quoted className property key is the only string token examined here.
                int keyEnd = index + 1 + "className".length();
                if (keyEnd < source.length() && source.startsWith("className", index + 1)
                        && source.charAt(keyEnd) == current) {
                    int next = skipWhitespace(source, keyEnd + 1);
                    if (next < source.length() && source.charAt(next) == ':') {
                        int valueEnd = classNameValueEnd(source, next + 1);
                        if (valueEnd > 0) {
                            String value = classNameValue(source, next + 1, valueEnd);
                            if (hasLegacyClassNameValue(value)) return true;
                            index = valueEnd;
                            continue;
                        }
                    }
                }
                int stringEnd = skipQuotedString(source, index, current);
                if (stringEnd > index + 1) {
                    String value = decodeUnicodeSearchEscapes(source.substring(index + 1, stringEnd - 1));
                    if (hasLegacyClassNameValue(value) &&
                            (isCallArgument(source, index) || isDynamicClassNameValue(source, index))) return true;
                }
                index = stringEnd;
                continue;
            }
            if (source.startsWith("className", index)
                    && (index == 0 || !isJsNameChar(source.charAt(index - 1)))
                    && (index + 9 == source.length() || !isJsNameChar(source.charAt(index + 9)))) {
                int next = skipWhitespace(source, index + 9);
                if (next < source.length() && source.charAt(next) == ':') {
                    int valueEnd = classNameValueEnd(source, next + 1);
                    if (valueEnd > 0) {
                        String value = classNameValue(source, next + 1, valueEnd);
                        if (hasLegacyClassNameValue(value)) return true;
                        index = valueEnd;
                        continue;
                    }
                }
            }
            index++;
        }
        return false;
    }

    private static int classNameValueEnd(String source, int afterColon) {
        int start = skipWhitespace(source, afterColon);
        if (start >= source.length() || (source.charAt(start) != '\'' && source.charAt(start) != '"' && source.charAt(start) != '`')) return -1;
        char quote = source.charAt(start);
        int end = skipQuotedString(source, start, quote);
        if (quote == '`' && hasTemplateInterpolation(source, start, end)) return -1;
        return end > start + 1 && end <= source.length() && source.charAt(end - 1) == source.charAt(start) ? end : -1;
    }

    private static boolean hasTemplateInterpolation(String source, int start, int end) {
        for (int i = start + 1; i + 1 < end - 1; i++) {
            if (source.charAt(i) != '$' || source.charAt(i + 1) != '{') continue;
            int slashes = 0;
            for (int j = i - 1; j > start && source.charAt(j) == '\\'; j--) slashes++;
            if ((slashes & 1) == 0) return true;
        }
        return false;
    }

    private static boolean isCallArgument(String source, int start) {
        int previous = start - 1;
        while (previous >= 0 && Character.isWhitespace(source.charAt(previous))) previous--;
        return previous >= 0 && (source.charAt(previous) == '(' || source.charAt(previous) == ',');
    }

    private static boolean isDynamicClassNameValue(String source, int valueStart) {
        int boundary = valueStart - 1;
        int lookback = 0;
        while (boundary >= 0 && source.charAt(boundary) != ';' && source.charAt(boundary) != '{' && source.charAt(boundary) != '}' && lookback < 4096) {
            boundary--;
            lookback++;
        }
        if (boundary >= 0 && source.charAt(boundary) != ';' && source.charAt(boundary) != '{' && source.charAt(boundary) != '}') return true;
        for (int key = valueStart - 9; key > boundary; key--) {
            if (!source.startsWith("className", key) || (key > 0 && isJsNameChar(source.charAt(key - 1)))) continue;
            int colon = skipWhitespace(source, key + 9);
            if (colon < valueStart && source.charAt(colon) == ':') return true;
        }
        return false;
    }

    private static String classNameValue(String source, int afterColon, int end) {
        int quote = skipWhitespace(source, afterColon);
        return decodeUnicodeSearchEscapes(source.substring(quote + 1, end - 1));
    }

    private static boolean hasLegacyClassNameValue(String value) {
        if (looksLikeResource(value)) return false;
        Matcher token = CLASS_NAME_TOKEN.matcher(value);
        while (token.find()) {
            String name = token.group();
            String normalized = name.toLowerCase(Locale.ROOT);
            if (normalized.startsWith("lcp-") || normalized.startsWith("lc-dialog") || MAPPINGS.containsKey(name)) return true;
        }
        return false;
    }

    private static int skipQuotedString(String source, int start, char quote) {
        int index = start + 1;
        while (index < source.length()) {
            char value = source.charAt(index++);
            if (value == '\\') { if (index < source.length()) index++; continue; }
            if (value == quote) return index;
        }
        return source.length();
    }

    private static boolean isLegacyClassToken(String value) {
        String normalized = value.toLowerCase(Locale.ROOT);
        return normalized.startsWith("lcp-") || normalized.startsWith("lc-dialog") || normalized.startsWith("--lcp-");
    }

    private static String decodeUnicodeSearchEscapes(String value) {
        Matcher matcher = JS_UNICODE_ESCAPE.matcher(value);
        StringBuffer output = new StringBuffer();
        while (matcher.find()) {
            int codePoint = Integer.parseInt(matcher.group(1) != null ? matcher.group(1) : matcher.group(2), 16);
            String replacement = Character.isValidCodePoint(codePoint) && (codePoint < 0xD800 || codePoint > 0xDFFF)
                    ? new String(Character.toChars(codePoint)) : matcher.group();
            matcher.appendReplacement(output, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(output);
        return output.toString();
    }

    private static boolean isCssNameStart(char value) {
        return isNameChar(value) || value == '\\';
    }

    private static int cssSearchNameEnd(String text, int start) {
        int index = start;
        while (index < text.length()) {
            char value = text.charAt(index);
            if (isNameChar(value)) { index++; continue; }
            if (value != '\\') break;
            index++;
            if (index >= text.length()) break;
            if (isHex(text.charAt(index))) {
                int count = 0;
                while (index < text.length() && count < 6 && isHex(text.charAt(index))) { index++; count++; }
                if (index < text.length() && isCssWhitespace(text.charAt(index))) index++;
            } else {
                index += Character.charCount(text.codePointAt(index));
            }
        }
        return index;
    }

    private static boolean isJsNameChar(char value) {
        return Character.isLetterOrDigit(value) || value == '_' || value == '$';
    }


    private static int skipWhitespace(String text, int index) {
        while (index < text.length() && Character.isWhitespace(text.charAt(index))) index++;
        return index;
    }

    private static boolean looksLikeResource(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.startsWith("/") || lower.startsWith("./") || lower.startsWith("../")
                || lower.startsWith("http:") || lower.startsWith("https:") || lower.startsWith("data:")
                || lower.matches(".*\\.(?:js|mjs|css|svg|png|jpe?g|gif|webp|woff2?|ttf)(?:[?#].*)?$");
    }

    private static String normalizeSearchEscapes(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (int index = 0; index < text.length();) {
            if (text.charAt(index) != '\\') { out.append(text.charAt(index++)); continue; }
            int start = index;
            while (index < text.length() && text.charAt(index) == '\\') index++;
            for (int count = 0; count < (index - start + 1) / 2; count++) out.append('\\');
        }
        return out.toString();
    }

    static String convert(String css, String fileName) {
        StringBuilder out = new StringBuilder(css.length());
        int bracketDepth = 0;
        int valueParens = 0;
        boolean declarationValue = false;
        boolean customValue = false;
        boolean statementStart = true;
        for (int i = 0; i < css.length();) {
            char c = css.charAt(i);
            if (c == '/' && i + 1 < css.length() && css.charAt(i + 1) == '*') {
                int end = css.indexOf("*/", i + 2);
                if (end < 0) throw unsupported(fileName, "注释未结束");
                out.append(css, i, end + 2); i = end + 2; continue;
            }
            if (c == '\'' || c == '"') {
                int end = stringEnd(css, i, fileName);
                String value = css.substring(i, end);
                if (bracketDepth > 0 && containsLegacyStylePrefix(value)) throw unsupported(fileName, "属性选择器中的旧 UI 名称");
                out.append(value); i = end; continue;
            }
            if (startsUrl(css, i)) {
                int end = urlEnd(css, i + 4, fileName);
                out.append(css, i, end); i = end; statementStart = false; continue;
            }
            if (!declarationValue && c == '[' && bracketDepth == 0) {
                int end = attributeEnd(css, i, fileName);
                String selector = css.substring(i, end);
                String mapped = mapExactClassSelector(selector, fileName);
                if (mapped != null) {
                    out.append(mapped); i = end; statementStart = false; continue;
                }
                if (containsLegacyStylePrefix(decodeCssEscapes(selector, fileName)))
                    throw unsupported(fileName, "属性选择器中的旧 UI 名称");
            }
            if (customValue && c == '{') throw unsupported(fileName, "自定义属性中的嵌套块");
            if (declarationValue && c == '(') valueParens++;
            if (declarationValue && c == ')' && valueParens > 0) valueParens--;
            if (declarationValue && valueParens == 0 && (c == ';' || c == '}')) {
                declarationValue = false; customValue = false;
            }
            if (!declarationValue && (c == '{' || c == '}' || c == ';')) statementStart = true;
            if (c == '[') bracketDepth++;
            if (c == ']') bracketDepth = Math.max(0, bracketDepth - 1);
            if (c == '.' && i + 1 < css.length() && (isNameChar(css.charAt(i + 1)) || css.charAt(i + 1) == '\\')) {
                int end = cssNameEnd(css, i + 1, fileName);
                String rawName = css.substring(i + 1, end);
                String name = decodeCssEscapes(rawName, fileName);
                String mapped = MAPPINGS.getProperty(name);
                if (rawName.indexOf('\\') >= 0 && mapped == null && containsLegacyStylePrefix(name))
                    throw unsupported(fileName, "转义后的旧 UI 类名没有精确映射");
                if (mapped != null && bracketDepth > 0) throw unsupported(fileName, "属性选择器中的旧 UI 名称");
                out.append('.').append(mapped == null || declarationValue ? rawName : mapped); i = end; statementStart = false; continue;
            }
            if (c == '-' && i + 1 < css.length() && css.charAt(i + 1) == '-') {
                int end = cssNameEnd(css, i, fileName);
                String rawName = css.substring(i, end);
                String name = decodeCssEscapes(rawName, fileName);
                String mapped = MAPPINGS.getProperty(name);
                if (rawName.indexOf('\\') >= 0 && mapped == null && containsLegacyStylePrefix(name))
                    throw unsupported(fileName, "转义后的旧 UI 变量没有精确映射");
                if (bracketDepth > 0 && containsLegacyStylePrefix(name)) throw unsupported(fileName, "属性选择器中的旧 UI 名称");
                boolean declaration = !declarationValue && statementStart && followsColon(css, end);
                boolean replace = followsVarFunction(css, i) || (!declarationValue &&
                        (declaration || followsPropertyRule(css, i) || followsContainerStyleQuery(css, i)));
                out.append(replace ? mapped != null ? mapped : rawName : rawName);
                if (declaration) { declarationValue = true; customValue = true; valueParens = 0; }
                i = end; statementStart = false; continue;
            }
            if (bracketDepth > 0 && isNameChar(c)) {
                int end = nameEnd(css, i);
                String name = css.substring(i, end);
                if (containsLegacyStylePrefix(name)) throw unsupported(fileName, "属性选择器中的旧 UI 名称");
                out.append(name); i = end; continue;
            }
            if (statementStart && isNameChar(c)) {
                int end = nameEnd(css, i);
                if (followsColon(css, end) && isDeclaration(css, end, fileName)) {
                    declarationValue = true; valueParens = 0;
                }
                out.append(css, i, end); i = end; statementStart = false; continue;
            }
            if (c == '\\') {
                int end = cssEscapeEnd(css, i, fileName);
                out.append(css, i, end);
                i = end;
                continue;
            }
            out.append(c); i++;
            if (!Character.isWhitespace(c) && c != '{' && c != '}' && c != ';') statementStart = false;
        }
        return out.toString();
    }

    private static boolean containsLegacyStylePrefix(String value) {
        String normalized = value.toLowerCase(Locale.ROOT);
        return normalized.contains("lcp-") || normalized.contains("lc-dialog");
    }

    private static int attributeEnd(String text, int start, String fileName) {
        for (int i = start + 1; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '/' && i + 1 < text.length() && text.charAt(i + 1) == '*') {
                int end = text.indexOf("*/", i + 2);
                if (end < 0) throw unsupported(fileName, "属性选择器中的注释未结束");
                i = end + 1; continue;
            }
            if (c == '\'' || c == '"') {
                int end = stringEnd(text, i, fileName);
                i = end - 1; continue;
            }
            if (c == '\\') { i = cssEscapeEnd(text, i, fileName) - 1; continue; }
            if (c == ']') return i + 1;
        }
        throw unsupported(fileName, "属性选择器未结束");
    }

    private static String mapExactClassSelector(String selector, String fileName) {
        // CSS comments between tokens are equivalent to whitespace for this grammar. Mask them
        // without changing offsets so the exact selector check can preserve every source comment.
        selector = normalizeEscapedClassAttributeName(selector, fileName);
        String masked = maskCssComments(selector, fileName);
        Matcher match = EXACT_CLASS_SELECTOR.matcher(masked);
        if (!match.matches()) return null;
        int group = match.group(3) != null ? 3 : 4;
        String value = selector.substring(match.start(group), match.end(group));
        StringBuilder mapped = new StringBuilder(value.length());
        for (int i = 0; i < value.length();) {
            if (isCssWhitespace(value.charAt(i))) { mapped.append(value.charAt(i++)); continue; }
            int start = i;
            while (i < value.length() && !isCssWhitespace(value.charAt(i))) {
                i = value.charAt(i) == '\\' ? cssEscapeEnd(value, i, fileName) : i + Character.charCount(value.codePointAt(i));
            }
            String rawName = value.substring(start, i);
            String name = decodeCssEscapes(rawName, fileName);
            String replacement = MAPPINGS.getProperty(name);
            if (rawName.indexOf('\\') >= 0 && replacement == null && containsLegacyStylePrefix(name))
                throw unsupported(fileName, "转义后的旧 UI 类名没有精确映射");
            mapped.append(replacement == null ? rawName : replacement);
        }
        return selector.substring(0, match.start(group)) + mapped + selector.substring(match.end(group));
    }

    /** Normalizes only an escaped CSS attribute identifier that decodes exactly to `class`. */
    private static String normalizeEscapedClassAttributeName(String selector, String fileName) {
        String masked = maskCssComments(selector, fileName);
        int start = 1;
        while (start < masked.length() && isCssWhitespace(masked.charAt(start))) start++;
        if (start >= masked.length() || !(isNameChar(masked.charAt(start)) || masked.charAt(start) == '\\'))
            return selector;
        int end = cssNameEnd(masked, start, fileName);
        String rawName = masked.substring(start, end);
        if (rawName.indexOf('\\') < 0 || !"class".equals(decodeCssEscapes(rawName, fileName)))
            return selector;
        // The escape and any hexadecimal terminator whitespace form one CSS identifier token.
        // Replacing that token with its decoded spelling preserves selector meaning.
        return selector.substring(0, start) + "class" + selector.substring(end);
    }

    /** Replaces comments outside strings with spaces while preserving offsets and line breaks. */
    private static String maskCssComments(String selector, String fileName) {
        StringBuilder masked = new StringBuilder(selector.length());
        char quote = 0;
        for (int i = 0; i < selector.length();) {
            char current = selector.charAt(i);
            if (quote != 0) {
                masked.append(current);
                i++;
                if (current == '\\' && i < selector.length()) {
                    masked.append(selector.charAt(i++));
                } else if (current == quote) {
                    quote = 0;
                }
                continue;
            }
            if (current == '\'' || current == '"') {
                quote = current;
                masked.append(current);
                i++;
                continue;
            }
            if (current == '\\') {
                int end = cssEscapeEnd(selector, i, fileName);
                masked.append(selector, i, end);
                i = end;
                continue;
            }
            if (current == '/' && i + 1 < selector.length() && selector.charAt(i + 1) == '*') {
                int end = selector.indexOf("*/", i + 2);
                if (end < 0) throw unsupported(fileName, "属性选择器中的注释未结束");
                for (int j = i; j < end + 2; j++) {
                    char commentChar = selector.charAt(j);
                    masked.append(isCssWhitespace(commentChar) ? commentChar : ' ');
                }
                i = end + 2;
                continue;
            }
            masked.append(current);
            i++;
        }
        return masked.toString();
    }

    private static boolean startsUrl(String value, int index) {
        return value.regionMatches(true, index, "url(", 0, 4)
                && (index == 0 || !isNameChar(value.charAt(index - 1)));
    }

    private static boolean followsColon(String text, int index) {
        while (index < text.length()) {
            if (Character.isWhitespace(text.charAt(index))) { index++; continue; }
            if (text.startsWith("/*", index)) {
                int end = text.indexOf("*/", index + 2);
                if (end < 0) return false;
                index = end + 2; continue;
            }
            break;
        }
        return index < text.length() && text.charAt(index) == ':';
    }

    private static boolean isDeclaration(String text, int index, String fileName) {
        int parens = 0;
        int brackets = 0;
        for (int i = index; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '/' && i + 1 < text.length() && text.charAt(i + 1) == '*') {
                int end = text.indexOf("*/", i + 2);
                if (end < 0) throw unsupported(fileName, "注释未结束");
                i = end + 1; continue;
            }
            if (c == '\'' || c == '"') { i = stringEnd(text, i, fileName) - 1; continue; }
            if (c == '(') parens++;
            else if (c == ')' && parens > 0) parens--;
            else if (c == '[') brackets++;
            else if (c == ']' && brackets > 0) brackets--;
            else if (parens == 0 && brackets == 0) {
                if (c == '{') return false;
                if (c == ';' || c == '}') return true;
            }
        }
        return true;
    }

    private static boolean followsVarFunction(String text, int index) {
        return followsFunction(text, index, "var");
    }

    private static boolean followsContainerStyleQuery(String text, int index) {
        if (!followsFunction(text, index, "style")) return false;
        int boundary = Math.max(text.lastIndexOf('{', index), Math.max(text.lastIndexOf('}', index), text.lastIndexOf(';', index)));
        int start = boundary + 1;
        while (start < index) {
            if (Character.isWhitespace(text.charAt(start))) { start++; continue; }
            if (text.startsWith("/*", start)) {
                int end = text.indexOf("*/", start + 2);
                if (end < 0 || end >= index) return false;
                start = end + 2; continue;
            }
            break;
        }
        return text.regionMatches(true, start, "@container", 0, 10)
                && (start + 10 == text.length() || !isNameChar(text.charAt(start + 10)));
    }

    private static boolean followsFunction(String text, int index, String function) {
        int i = skipWhitespaceAndCommentsBack(text, index - 1);
        if (i < 0 || text.charAt(i) != '(') return false;
        i = skipWhitespaceAndCommentsBack(text, i - 1);
        int start = i - function.length() + 1;
        return start >= 0 && text.regionMatches(true, start, function, 0, function.length())
                && (start == 0 || !isNameChar(text.charAt(start - 1)));
    }

    private static boolean followsPropertyRule(String text, int index) {
        int end = skipWhitespaceAndCommentsBack(text, index - 1);
        int start = end - 8;
        return start >= 0 && text.regionMatches(true, start, "@property", 0, 9)
                && (start == 0 || !isNameChar(text.charAt(start - 1)));
    }

    private static int skipWhitespaceAndCommentsBack(String text, int index) {
        while (index >= 0) {
            if (Character.isWhitespace(text.charAt(index))) { index--; continue; }
            if (index > 0 && text.charAt(index) == '/' && text.charAt(index - 1) == '*') {
                int start = text.lastIndexOf("/*", index - 2);
                if (start < 0) return -1;
                index = start - 1; continue;
            }
            break;
        }
        return index;
    }

    private static int urlEnd(String text, int index, String fileName) {
        for (int i = index; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\\') { i++; continue; }
            if (c == '\'' || c == '"') { i = stringEnd(text, i, fileName) - 1; continue; }
            if (c == ')') return i + 1;
        }
        throw unsupported(fileName, "URL 未结束");
    }

    private static int stringEnd(String text, int start, String fileName) {
        char quote = text.charAt(start);
        for (int i = start + 1; i < text.length(); i++) {
            if (text.charAt(i) == '\\') { i++; continue; }
            if (text.charAt(i) == quote) return i + 1;
        }
        throw unsupported(fileName, "字符串未结束");
    }

    private static int nameEnd(String text, int start) {
        int i = start;
        while (i < text.length() && isNameChar(text.charAt(i))) i++;
        return i;
    }

    private static int cssNameEnd(String text, int start, String fileName) {
        int i = start;
        while (i < text.length()) {
            if (isNameChar(text.charAt(i))) { i++; continue; }
            if (text.charAt(i) == '\\') { i = cssEscapeEnd(text, i, fileName); continue; }
            break;
        }
        return i;
    }

    private static int cssEscapeEnd(String text, int slash, String fileName) {
        int i = slash + 1;
        if (i >= text.length()) throw unsupported(fileName, "CSS 转义不完整");
        char first = text.charAt(i);
        if (first == '\n' || first == '\r' || first == '\f')
            throw unsupported(fileName, "CSS 转义中的换行续接");
        if (isHex(first)) {
            int count = 0;
            while (i < text.length() && count < 6 && isHex(text.charAt(i))) { i++; count++; }
            if (i < text.length() && isCssWhitespace(text.charAt(i))) {
                if (text.charAt(i) == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                i++;
            }
            return i;
        }
        return i + Character.charCount(text.codePointAt(i));
    }

    private static String decodeCssEscapes(String text, String fileName) {
        StringBuilder decoded = new StringBuilder(text.length());
        for (int i = 0; i < text.length();) {
            if (text.charAt(i) != '\\') { decoded.append(text.charAt(i++)); continue; }
            int end = cssEscapeEnd(text, i, fileName);
            int digit = i + 1;
            if (digit < text.length() && isHex(text.charAt(digit))) {
                while (digit < end && isHex(text.charAt(digit)) && digit - (i + 1) < 6) digit++;
                int codePoint = Integer.parseInt(text.substring(i + 1, digit), 16);
                decoded.appendCodePoint(Character.isValidCodePoint(codePoint) && (codePoint < 0xD800 || codePoint > 0xDFFF) && codePoint != 0
                        ? codePoint : 0xFFFD);
            } else if (digit < text.length() && (text.charAt(digit) == '\n' || text.charAt(digit) == '\r' || text.charAt(digit) == '\f')) {
                // CSS line continuations produce no character.
            } else {
                decoded.append(text, digit, end);
            }
            i = end;
        }
        return decoded.toString();
    }

    private static boolean isHex(char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    }

    private static boolean isCssWhitespace(char c) {
        return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f';
    }

    private static boolean isNameChar(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-' || c >= 0x80;
    }

    private static IllegalArgumentException unsupported(String fileName, String reason) {
        return new IllegalArgumentException("组件 " + fileName + " 的旧 UI 样式无法安全转换：" + reason);
    }

    private static Properties loadMappings() {
        Properties result = new Properties();
        try (InputStream in = LegacyUiStyleConverter.class.getResourceAsStream("/legacy-ui-style-map.properties")) {
            if (in == null) throw new IllegalStateException("缺少旧 UI 样式映射");
            result.load(in);
            return result;
        } catch (IOException e) {
            throw new IllegalStateException("无法读取旧 UI 样式映射", e);
        }
    }
}
