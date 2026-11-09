/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.util;

/**
 * 不依赖 JSON 解析器的文本格式化工具，合法 JSON 与语法损坏的文本均可处理。
 *
 * <p>仅调整字符串和注释之外的结构空白，不补逗号、括号或引号，也不重写数字、
 * 字段顺序或转义。未闭合的字符串/注释会保留其剩余原文；格式化不代表语法校验通过。
 * 输入应是已经拼接完成的文本，不应对独立写入块分别格式化。</p>
 */
public final class JsonFormatter {
    private static final int DEFAULT_INDENT_SIZE = 2;
    private static final int MAX_INDENT_DEPTH = 64;

    private JsonFormatter() {
    }

    /** 默认使用两空格缩进和 LF 换行；null 返回 null，纯 JSON 空白返回空字符串。 */
    public static String format(String input) {
        return format(input, DEFAULT_INDENT_SIZE);
    }

    /**
     * @param indentSize 每级缩进的空格数，范围 0–8；最多显示 64 级缩进，保留全部括号
     * @return 格式化文本，字符串和注释的内容保持原样
     */
    public static String format(String input, int indentSize) {
        if (indentSize < 0 || indentSize > 8) {
            throw new IllegalArgumentException("indentSize 必须在 0–8 之间");
        }
        return input == null ? null : new Formatter(input, indentSize).format();
    }

    private enum Kind {
        OPEN, CLOSE, COMMA, COLON, STRING, VALUE, COMMENT
    }

    /** 每次调用独立保存扫描状态，工具类没有共享的可变数据。 */
    private static final class Formatter {
        private final String input;
        private final int indentSize;
        private final StringBuilder output;
        private int depth;
        private Kind previous;
        private char previousSymbol;
        private boolean breakBeforeNext;

        private Formatter(String input, int indentSize) {
            this.input = input;
            this.indentSize = indentSize;
            this.output = new StringBuilder(input.length());
        }

        private String format() {
            int cursor = 0;
            while (cursor < input.length()) {
                int whitespaceStart = cursor;
                while (cursor < input.length() && isWhitespace(input.charAt(cursor))) {
                    cursor++;
                }
                if (cursor == input.length()) {
                    break;
                }
                char symbol = input.charAt(cursor);
                Kind kind = kindAt(cursor);
                int end = tokenEnd(cursor, kind);
                prepareToken(kind, symbol, whitespaceStart, cursor);
                output.append(input, cursor, end);
                if (kind == Kind.OPEN) {
                    depth++;
                }
                breakBeforeNext = kind == Kind.OPEN || kind == Kind.COMMA
                        || kind == Kind.COMMENT && input.startsWith("//", cursor);
                previous = kind;
                previousSymbol = symbol;
                cursor = end;
            }
            return output.toString();
        }

        private void prepareToken(Kind kind, char symbol, int whitespaceStart, int tokenStart) {
            if (kind == Kind.CLOSE) {
                depth = Math.max(0, depth - 1);
                boolean empty = previous == Kind.OPEN
                        && (previousSymbol == '{' && symbol == '}' || previousSymbol == '[' && symbol == ']');
                if (!empty) {
                    newLine();
                }
            } else if (breakBeforeNext) {
                newLine();
            } else if (previous == Kind.COLON && kind != Kind.COMMA && kind != Kind.COLON) {
                output.append(' ');
            } else if (tokenStart > whitespaceStart && needsSeparator(previous, kind)) {
                // 错误输入中的 1 2、tru e 等仍需分隔，不能变成 12 或 true。
                boolean hasLineBreak = false;
                for (int i = whitespaceStart; i < tokenStart; i++) {
                    if (input.charAt(i) == '\r' || input.charAt(i) == '\n') {
                        hasLineBreak = true;
                        break;
                    }
                }
                if (hasLineBreak) {
                    newLine();
                } else {
                    output.append(' ');
                }
            }
            indentIfLineStart();
        }

        private Kind kindAt(int offset) {
            return switch (input.charAt(offset)) {
                case '{', '[' -> Kind.OPEN;
                case '}', ']' -> Kind.CLOSE;
                case ',' -> Kind.COMMA;
                case ':' -> Kind.COLON;
                case '"', '\'' -> Kind.STRING;
                default -> startsComment(offset) ? Kind.COMMENT : Kind.VALUE;
            };
        }

        private int tokenEnd(int start, Kind kind) {
            if (kind == Kind.STRING) {
                char quote = input.charAt(start);
                boolean escaped = false;
                for (int i = start + 1; i < input.length(); i++) {
                    char character = input.charAt(i);
                    if (escaped) {
                        escaped = false;
                    } else if (character == '\\') {
                        escaped = true;
                    } else if (character == quote) {
                        return i + 1;
                    }
                }
                return input.length();
            }
            if (kind == Kind.COMMENT) {
                if (input.charAt(start + 1) == '*') {
                    int closing = input.indexOf("*/", start + 2);
                    return closing < 0 ? input.length() : closing + 2;
                }
                int end = start + 2;
                while (end < input.length() && input.charAt(end) != '\r' && input.charAt(end) != '\n') {
                    end++;
                }
                // 保留行注释的结束换行，避免下一项被吞入注释。
                if (end < input.length() && input.charAt(end) == '\r') {
                    end++;
                }
                if (end < input.length() && input.charAt(end) == '\n') {
                    end++;
                }
                return end;
            }
            if (kind != Kind.VALUE) {
                return start + 1;
            }
            int end = start + 1;
            while (end < input.length()) {
                char character = input.charAt(end);
                if (isWhitespace(character) || "{}[],:\"'".indexOf(character) >= 0 || startsComment(end)) {
                    break;
                }
                end++;
            }
            return end;
        }

        private boolean startsComment(int offset) {
            return input.charAt(offset) == '/' && offset + 1 < input.length()
                    && (input.charAt(offset + 1) == '/' || input.charAt(offset + 1) == '*');
        }

        private void newLine() {
            if (!output.isEmpty() && !atLineStart()) {
                output.append('\n');
            }
        }

        private void indentIfLineStart() {
            if (atLineStart()) {
                output.append(" ".repeat(Math.min(depth, MAX_INDENT_DEPTH) * indentSize));
            }
        }

        private boolean atLineStart() {
            return output.isEmpty() || output.charAt(output.length() - 1) == '\n'
                    || output.charAt(output.length() - 1) == '\r';
        }
    }

    private static boolean needsSeparator(Kind previous, Kind current) {
        return previous != null && previous != Kind.OPEN && previous != Kind.COMMA && previous != Kind.COLON
                && current != Kind.CLOSE && current != Kind.COMMA && current != Kind.COLON;
    }

    private static boolean isWhitespace(char character) {
        // 非 JSON 空白（例如 NBSP）属于原文，不能删除后掩盖语法错误。
        return character == ' ' || character == '\t' || character == '\r' || character == '\n';
    }
}
