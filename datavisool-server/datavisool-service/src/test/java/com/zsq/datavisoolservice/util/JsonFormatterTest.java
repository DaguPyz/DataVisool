/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JsonFormatterTest {

    private final ObjectMapper objectMapper = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    @Test
    void formatsNestedObjectsAndArrays() {
        String input = "{\"name\":\"A\",\"items\":[1,2,{\"ok\":true}],\"enabled\":false}";

        assertEquals("""
                {
                  "name": "A",
                  "items": [
                    1,
                    2,
                    {
                      "ok": true
                    }
                  ],
                  "enabled": false
                }
                """.stripTrailing(), JsonFormatter.format(input));
    }

    @Test
    void keepsEmptyContainersCompact() {
        assertEquals("{\n  \"emptyObject\": {},\n  \"emptyArray\": []\n}",
                JsonFormatter.format("{\"emptyObject\":{},\"emptyArray\":[]}"));
    }

    @Test
    void doesNotTreatPunctuationInsideStringsAsStructure() {
        String input = "{\"text\":\"comma, braces {} and brackets []\",\"url\":\"https://example.test/a,b\"}";

        assertEquals("""
                {
                  "text": "comma, braces {} and brackets []",
                  "url": "https://example.test/a,b"
                }
                """.stripTrailing(), JsonFormatter.format(input));
    }

    @Test
    void handlesOddAndEvenBackslashRunsAroundQuotes() {
        String input = "{\"odd\":\"say " + "\\" + "\" hi, ]\",\"even\":\"tail " + "\\\\" + "\"}";
        String expected = "{\n  \"odd\": \"say " + "\\" + "\" hi, ]\",\n  \"even\": \"tail " + "\\\\" + "\"\n}";

        assertEquals(expected, JsonFormatter.format(input));
        assertJsonParses(expected);
    }

    @Test
    void preservesTrailingCommaAndLeavesJsonInvalid() {
        String formatted = JsonFormatter.format("{\"items\":[1,2,]}");

        assertTrue(formatted.contains("2,\n  ]"));
        assertTrue(formatted.contains("2,"));
        assertJsonRemainsInvalid(formatted);
    }

    @Test
    void preservesMissingCommaAndDoesNotMergeAdjacentValues() {
        String formatted = JsonFormatter.format("{\"items\":[1 2]}");

        assertTrue(formatted.matches("(?s).*1\\s+2.*"));
        assertFalse(formatted.contains("12"));
        assertFalse(formatted.matches("(?s).*1\\s*,\\s*2.*"));
        assertJsonRemainsInvalid(formatted);
    }

    @Test
    void preservesSingleQuotedStringPunctuationAndLeavesJsonInvalid() {
        String formatted = JsonFormatter.format("{\"text\":'comma, ] }'}");

        assertTrue(formatted.contains("\"text\": 'comma, ] }'"));
        assertJsonRemainsInvalid(formatted);
    }

    @Test
    void scalarValuesWithoutASeparatorStaySeparateAndFormattingIsIdempotent() {
        String formatted = JsonFormatter.format("[true false]");

        assertTrue(formatted.matches("(?s).*true\\s+false.*"));
        assertFalse(formatted.contains("truefalse"));
        assertEquals(formatted, JsonFormatter.format(formatted));
        assertJsonRemainsInvalid(formatted);
    }

    @Test
    void doesNotInventClosingBracketsForTruncatedInput() {
        String input = "{\"items\":[1,2";
        String formatted = JsonFormatter.format(input);

        assertTrue(formatted.startsWith("{\n  \"items\": [\n    1,\n    2"));
        assertEquals(count(input, '{'), count(formatted, '{'));
        assertEquals(count(input, '['), count(formatted, '['));
        assertEquals(count(input, '}'), count(formatted, '}'));
        assertEquals(count(input, ']'), count(formatted, ']'));
        assertJsonRemainsInvalid(formatted);
    }

    @Test
    void preservesUnterminatedStringTailWithoutInterpretingItsPunctuation() {
        String input = "{\"name\":\"broken, ] } , other:1}";
        String formatted = JsonFormatter.format(input);

        assertTrue(formatted.endsWith("\"broken, ] } , other:1}"));
        assertEquals(count(input, '}'), count(formatted, '}'));
        assertJsonRemainsInvalid(formatted);
    }

    @Test
    void preservesLiteralAndNumberLexemes() {
        String input = "{\"large\":1234567890123456789012345678901234567890,\"exponent\":-0.000100e+0009,\"flags\":[true,false,null]}";
        String formatted = JsonFormatter.format(input);

        assertTrue(formatted.contains("1234567890123456789012345678901234567890"));
        assertTrue(formatted.contains("-0.000100e+0009"));
        assertTrue(formatted.contains("true,"));
        assertTrue(formatted.contains("false,"));
        assertTrue(formatted.contains("null"));
        assertJsonParses(formatted);
    }

    @Test
    void preservesCommentsAndIgnoresTheirStructuralCharacters() {
        String input = "{\"block\":1/* , } ] */ ,\"line\":2// , } ]\n}";
        String formatted = JsonFormatter.format(input);

        assertTrue(formatted.contains("1/* , } ] */"));
        assertTrue(formatted.contains("2// , } ]\n}"));
        assertEquals(count(input, '{'), count(formatted, '{'));
        assertEquals(count(input, '}'), count(formatted, '}'));
        assertJsonRemainsInvalid(formatted);
    }

    @Test
    void preservesUnexpectedClosingBracketAndLeavesJsonInvalid() {
        String input = "{\"value\":1}}";
        String formatted = JsonFormatter.format(input);

        assertEquals(2, count(formatted, '}'));
        assertTrue(formatted.stripTrailing().endsWith("}"));
        assertJsonRemainsInvalid(formatted);
    }

    @Test
    void formattingIsIdempotent() {
        String formatted = JsonFormatter.format("{\"items\":[1,2,],\"note\":\"x,y\"}");

        assertEquals(formatted, JsonFormatter.format(formatted));
    }

    @Test
    void supportsConfiguredIndentWidthAndValidatesItsRange() {
        assertEquals("{\n \"value\": 1\n}", JsonFormatter.format("{\"value\":1}", 1));
        assertEquals("{\n        \"value\": 1\n}", JsonFormatter.format("{\"value\":1}", 8));
        assertThrows(IllegalArgumentException.class, () -> JsonFormatter.format("{}", -1));
        assertThrows(IllegalArgumentException.class, () -> JsonFormatter.format("{}", 9));
    }

    @Test
    void handlesNullAndWhitespaceOnlyInput() {
        assertNull(JsonFormatter.format(null));
        assertEquals("", JsonFormatter.format(" \t\r\n"));
    }

    @Test
    void formatsLargeInputConsistentlyWithoutTimingAssumptions() throws JsonProcessingException {
        StringBuilder input = new StringBuilder("[");
        int itemCount = 2_000;
        for (int i = 0; i < itemCount; i++) {
            if (i > 0) {
                input.append(',');
            }
            input.append("{\"i\":").append(i).append(",\"s\":\"value-").append(i).append("\"}");
        }
        input.append(']');

        String source = input.toString();
        String formatted = JsonFormatter.format(source);

        assertEquals(objectMapper.readTree(source), objectMapper.readTree(formatted));
        assertTrue(formatted.startsWith("[\n  {\n    \"i\": 0,"));
        assertTrue(formatted.endsWith("  }\n]"));
        assertEquals(formatted, JsonFormatter.format(formatted));
    }

    @Test
    void capsIndentationAt64LevelsWithoutDroppingNestedContainers() throws JsonProcessingException {
        int depth = 70;
        String input = "[".repeat(depth) + "0" + "]".repeat(depth);
        String formatted = JsonFormatter.format(input);

        assertEquals(depth, count(formatted, '['));
        assertEquals(depth, count(formatted, ']'));
        assertEquals(128, maxIndentation(formatted));
        assertEquals(objectMapper.readTree(input), objectMapper.readTree(formatted));
    }

    private void assertJsonParses(String json) {
        try {
            objectMapper.readTree(json);
        } catch (JsonProcessingException exception) {
            throw new AssertionError("Expected valid JSON but got: " + json, exception);
        }
    }

    private void assertJsonRemainsInvalid(String json) {
        assertThrows(JsonProcessingException.class, () -> objectMapper.readTree(json));
    }

    private int count(String value, char character) {
        int count = 0;
        for (int i = 0; i < value.length(); i++) {
            if (value.charAt(i) == character) {
                count++;
            }
        }
        return count;
    }

    private int maxIndentation(String value) {
        int maximum = 0;
        for (String line : value.split("\\n", -1)) {
            int indentation = 0;
            while (indentation < line.length() && line.charAt(indentation) == ' ') {
                indentation++;
            }
            maximum = Math.max(maximum, indentation);
        }
        return maximum;
    }
}
