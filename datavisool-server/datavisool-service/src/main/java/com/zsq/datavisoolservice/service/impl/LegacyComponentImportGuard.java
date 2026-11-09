/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import org.mozilla.javascript.Context;
import org.mozilla.javascript.BaseFunction;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.RhinoException;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.PushbackReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Converts recognized legacy components during import, without executing their code.
 *
 * @deprecated Temporary compatibility for legacy component interfaces and styles.
 */
// TODO(legacy-compat): Remove this guard, its import calls and converter resources when legacy components are no longer supported.
@Deprecated(forRemoval = true)
final class LegacyComponentImportGuard {
    private static final String[] LEGACY_NAMES = {
            "LightChaserInterface", "LightChaserUtil", "LightChaserUI", "LCPUI", "LCPSDK", "LCPTypes",
            "__LIGHT_CHASER_REMOTE_COMPONENT_TEMP__", "__LCP_REMOTE_COMPONENT_BASE_URL_MAP__"
    };
    // A name may be written entirely with JavaScript Unicode escapes.
    private static final int OVERLAP = 512;
    private static final Pattern UNICODE_ESCAPE = Pattern.compile("\\\\u(?:([0-9a-fA-F]{4})|\\{([0-9a-fA-F]{1,6})\\})");
    private static final Pattern LEGACY_UI_STYLES = Pattern.compile("\\.lcp-[a-zA-Z0-9_-]+|--lcp-[a-zA-Z0-9_-]+|\\.lc-dialog[a-zA-Z0-9_-]*");
    private static final long MAX_CONVERT_BYTES = 4L * 1024 * 1024;
    private static final String ACORN_RESOURCE = "/META-INF/resources/webjars/acorn/8.16.0/dist/acorn.js";
    private static final String CONVERTER_RESOURCE = "/legacy-component-converter.js";

    private LegacyComponentImportGuard() {}

    static boolean validate(Path file, String componentName) throws IOException {
        if (!containsLegacyName(file)) return false;
        if (Files.size(file) > MAX_CONVERT_BYTES) {
            throw new IllegalArgumentException("组件 " + componentName + " 超出旧组件转换大小限制");
        }
        String source = Files.readString(file, StandardCharsets.UTF_8);
        try (Context context = Context.enter()) {
            context.setLanguageVersion(Context.VERSION_ECMASCRIPT);
            context.setOptimizationLevel(-1);
            context.setClassShutter(className -> false);
            Scriptable scope = context.initSafeStandardObjects();
            context.evaluateString(scope, readResource(ACORN_RESOURCE), "acorn", 1, null);
            context.evaluateString(scope, readResource(CONVERTER_RESOURCE), "converter", 1, null);
            Function convert = (Function) ScriptableObject.getProperty(scope, "convertLegacyComponent");
            Scriptable styleMappings = context.newObject(scope);
            var mappings = LegacyUiStyleConverter.mappings();
            for (String name : mappings.stringPropertyNames()) {
                if (!name.startsWith("--")) ScriptableObject.putProperty(styleMappings, name, mappings.getProperty(name));
            }
            BaseFunction cssConverter = new BaseFunction() {
                @Override
                public Object call(Context cx, Scriptable callbackScope, Scriptable thisObj, Object[] args) {
                    if (args.length != 1) throw Context.reportRuntimeError("脚本中的 CSS 转换参数无效");
                    try {
                        return LegacyUiStyleConverter.convert(Context.toString(args[0]), componentName);
                    } catch (IllegalArgumentException error) {
                        throw Context.throwAsScriptRuntimeEx(error);
                    }
                }
            };
            cssConverter.setParentScope(scope);
            cssConverter.setPrototype(ScriptableObject.getFunctionPrototype(scope));
            Scriptable result = (Scriptable) convert.call(context, scope, scope, new Object[]{source, styleMappings, cssConverter});
            if (!Context.toBoolean(ScriptableObject.getProperty(result, "legacy"))) return false;
            String converted = Context.toString(ScriptableObject.getProperty(result, "source"));
            Files.writeString(file, converted, StandardCharsets.UTF_8);
            return true;
        } catch (RhinoException e) {
            throw new IllegalArgumentException("组件 " + componentName + " 无法转换: " + e.details(), e);
        } catch (StackOverflowError e) {
            throw new IllegalArgumentException("组件 " + componentName + " 结构过于复杂，无法转换", e);
        }
    }

    static void validateLegacyStyles(Path file, String componentName) throws IOException {
        boolean requiresInspection = false;
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            char[] buffer = new char[8192];
            String previous = "";
            int read;
            while ((read = reader.read(buffer)) != -1) {
                String part = previous + new String(buffer, 0, read);
                if (LEGACY_UI_STYLES.matcher(part).find() || part.contains("lcp-")
                        || LegacyUiStyleConverter.containsLegacyStyleCandidate(part)) {
                    requiresInspection = true;
                    break;
                }
                previous = part.substring(Math.max(0, part.length() - OVERLAP));
            }
        }
        if (Files.size(file) > MAX_CONVERT_BYTES) {
            if (requiresInspection) throw new IllegalArgumentException("组件 " + componentName + " 超出旧 UI 样式转换大小限制");
            return;
        }
        String source = Files.readString(file, StandardCharsets.UTF_8);
        String converted = LegacyUiStyleConverter.convert(source, componentName);
        if (!source.equals(converted)) Files.writeString(file, converted, StandardCharsets.UTF_8);
    }

    private static boolean containsLegacyName(Path file) throws IOException {
        if (Files.size(file) > MAX_CONVERT_BYTES) return containsLargeFileCandidate(file);
        String part = stripJavaScriptComments(Files.readString(file, StandardCharsets.UTF_8));
        String decoded = decodeUnicodeEscapes(part);
        for (String name : LEGACY_NAMES) if (part.contains(name) || decoded.contains(name)) return true;
        // Parse only when a CSS token or className literal is an old style candidate;
        // arbitrary JavaScript escapes must not force modern scripts through Acorn 2022.
        return LEGACY_UI_STYLES.matcher(part).find() || LegacyUiStyleConverter.containsLegacyStyleCandidate(part);
    }

    /** Bounded-memory scan used before the 4 MiB conversion limit is checked. */
    private static boolean containsLargeFileCandidate(Path file) throws IOException {
        StringBuilder styleWindow = new StringBuilder();
        StringBuilder codeWindow = new StringBuilder();
        final int maxWindow = 16 * 1024;
        final int tailWindow = OVERLAP * 4;
        int quote = 0;
        boolean escaped = false;
        boolean templateExpression = false;
        int templateBraceDepth = 0;
        try (PushbackReader reader = new PushbackReader(Files.newBufferedReader(file, StandardCharsets.UTF_8), 2)) {
            int read;
            while ((read = reader.read()) != -1) {
                char current = (char) read;
                if (quote != 0) {
                    if (quote == '`' && !escaped && current == '$') {
                        int following = reader.read();
                        if (following == '{') {
                            if (appendCandidate(styleWindow, codeWindow, '$', true, maxWindow, tailWindow)
                                    || appendCandidate(styleWindow, codeWindow, '{', true, maxWindow, tailWindow)) return true;
                            quote = 0;
                            templateExpression = true;
                            templateBraceDepth = 1;
                            escaped = false;
                            continue;
                        }
                        if (following != -1) reader.unread(following);
                    }
                    if (appendCandidate(styleWindow, codeWindow, current, false, maxWindow, tailWindow)) return true;
                    if (escaped) escaped = false;
                    else if (current == '\\') escaped = true;
                    else if (current == quote) quote = 0;
                } else if (current == '\'' || current == '"' || current == '`') {
                    if (templateExpression && current == '`') return true; // nested templates are ambiguous in this bounded prefilter
                    quote = current;
                    escaped = false;
                    if (appendCandidate(styleWindow, codeWindow, current, false, maxWindow, tailWindow)) return true;
                } else if (current == '/') {
                    int following = reader.read();
                    if (following == '/') {
                        while ((read = reader.read()) != -1 && read != '\n' && read != '\r') {}
                        if (read == '\n' || read == '\r') {
                            if (appendCandidate(styleWindow, codeWindow, ' ', true, maxWindow, tailWindow)) return true;
                        }
                    } else if (following == '*') {
                        int previous = 0;
                        while ((read = reader.read()) != -1) {
                            if (previous == '*' && read == '/') break;
                            previous = read;
                        }
                        if (appendCandidate(styleWindow, codeWindow, ' ', true, maxWindow, tailWindow)) return true;
                    } else {
                        if (appendCandidate(styleWindow, codeWindow, current, true, maxWindow, tailWindow)) return true;
                        if (following != -1) reader.unread(following);
                    }
                } else {
                    if (templateExpression && current == '{') templateBraceDepth++;
                    if (templateExpression && current == '}') {
                        templateBraceDepth--;
                        if (templateBraceDepth == 0) {
                            if (appendCandidate(styleWindow, codeWindow, current, true, maxWindow, tailWindow)) return true;
                            templateExpression = false;
                            quote = '`';
                            continue;
                        }
                    }
                    if (appendCandidate(styleWindow, codeWindow, current, true, maxWindow, tailWindow)) return true;
                }
            }
        }
        if (templateExpression) return true;
        return hasLegacyCandidate(styleWindow, codeWindow);
    }

    private static boolean appendCandidate(StringBuilder styleWindow, StringBuilder codeWindow, char value,
                                           boolean code, int maxWindow, int tailWindow) {
        styleWindow.append(value);
        if (code) codeWindow.append(value);
        if (styleWindow.length() >= maxWindow || codeWindow.length() >= maxWindow) {
            if (hasLegacyCandidate(styleWindow, codeWindow) || hasUnresolvedLargeCandidate(styleWindow)) return true;
            retainTail(styleWindow, tailWindow);
            retainTail(codeWindow, tailWindow);
        }
        return false;
    }

    private static boolean hasLegacyCandidate(StringBuilder styleWindow, StringBuilder codeWindow) {
        String code = codeWindow.toString();
        String decoded = decodeUnicodeEscapes(code);
        for (String name : LEGACY_NAMES) if (code.contains(name) || decoded.contains(name)) return true;
        String styles = styleWindow.toString();
        return LEGACY_UI_STYLES.matcher(styles).find() || LegacyUiStyleConverter.containsLegacyStyleCandidate(styles);
    }

    private static boolean hasUnresolvedLargeCandidate(StringBuilder text) {
        String tail = text.toString();
        int marker = Math.max(tail.lastIndexOf("className"), Math.max(tail.lastIndexOf("'className'"), tail.lastIndexOf("\"className\"")));
        if (marker < 0) return false;
        int after = marker + (tail.startsWith("'className'", marker) || tail.startsWith("\"className\"", marker) ? 11 : 9);
        while (after < tail.length() && Character.isWhitespace(tail.charAt(after))) after++;
        if (after < tail.length() && tail.charAt(after) == ':') {
            after++;
            while (after < tail.length() && Character.isWhitespace(tail.charAt(after))) after++;
            return after == tail.length();
        }
        return after == tail.length();
    }

    private static void retainTail(StringBuilder text, int length) {
        if (text.length() > length) text.delete(0, text.length() - length);
    }

    private static String stripJavaScriptComments(String source) {
        char[] output = source.toCharArray();
        int index = 0;
        boolean regexAllowed = true;
        while (index < source.length()) {
            char current = source.charAt(index);
            if (current == '\'' || current == '"' || current == '`') {
                char quote = current;
                index++;
                while (index < source.length()) {
                    char value = source.charAt(index++);
                    if (value == '\\') { if (index < source.length()) index++; continue; }
                    if (value == quote) break;
                }
                regexAllowed = false;
                continue;
            }
            if (current == '/' && index + 1 < source.length() && source.charAt(index + 1) == '/') {
                int end = index + 2;
                while (end < source.length() && source.charAt(end) != '\n' && source.charAt(end) != '\r') end++;
                for (int i = index; i < end; i++) output[i] = ' ';
                index = end;
                continue;
            }
            if (current == '/' && index + 1 < source.length() && source.charAt(index + 1) == '*') {
                int end = source.indexOf("*/", index + 2);
                end = end < 0 ? source.length() : end + 2;
                for (int i = index; i < end; i++) if (output[i] != '\n' && output[i] != '\r') output[i] = ' ';
                index = end;
                continue;
            }
            if (current == '/' && regexAllowed) {
                index = skipRegexLiteral(source, index);
                regexAllowed = false;
                continue;
            }
            if (Character.isLetter(current) || current == '_' || current == '$') {
                int start = index++;
                while (index < source.length() && (Character.isLetterOrDigit(source.charAt(index)) || source.charAt(index) == '_' || source.charAt(index) == '$')) index++;
                String word = source.substring(start, index);
                regexAllowed = switch (word) {
                    case "return", "throw", "case", "delete", "void", "typeof", "new", "yield", "await", "else", "do", "instanceof", "in", "of" -> true;
                    default -> false;
                };
                continue;
            }
            if (Character.isDigit(current)) {
                index++;
                while (index < source.length() && (Character.isLetterOrDigit(source.charAt(index)) || source.charAt(index) == '.' || source.charAt(index) == '_')) index++;
                regexAllowed = false;
                continue;
            }
            if (current == '+' || current == '-') {
                boolean doubled = index + 1 < source.length() && source.charAt(index + 1) == current;
                index += doubled ? 2 : 1;
                if (!doubled) regexAllowed = true;
                continue;
            }
            index++;
            if (current == ')' || current == ']' || current == '.') regexAllowed = false;
            else if (current == '(' || current == '[' || current == '{' || current == '=' || current == ',' || current == ';' || current == ':' || current == '!' || current == '?' || current == '&' || current == '|' || current == '*' || current == '%') regexAllowed = true;
            else if (current == '/') regexAllowed = true;
        }
        return new String(output);
    }

    private static int skipRegexLiteral(String source, int start) {
        int index = start + 1;
        boolean inClass = false;
        while (index < source.length()) {
            char current = source.charAt(index++);
            if (current == '\\') { if (index < source.length()) index++; continue; }
            if (current == '[') inClass = true;
            else if (current == ']') inClass = false;
            else if (current == '/' && !inClass) {
                while (index < source.length() && Character.isLetter(source.charAt(index))) index++;
                return index;
            } else if (current == '\n' || current == '\r') return index;
        }
        return index;
    }

    private static String decodeUnicodeEscapes(String text) {
        Matcher matcher = UNICODE_ESCAPE.matcher(text);
        StringBuffer result = new StringBuffer();
        while (matcher.find()) {
            int codePoint = Integer.parseInt(matcher.group(1) != null ? matcher.group(1) : matcher.group(2), 16);
            String replacement = Character.isValidCodePoint(codePoint) ? new String(Character.toChars(codePoint)) : matcher.group();
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    private static String readResource(String name) throws IOException {
        try (InputStream stream = LegacyComponentImportGuard.class.getResourceAsStream(name)) {
            if (stream == null) throw new IOException("缺少组件转换器资源: " + name);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
