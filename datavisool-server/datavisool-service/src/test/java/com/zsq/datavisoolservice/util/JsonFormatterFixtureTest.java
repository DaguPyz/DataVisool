/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** A 为人工编写的原始文本，B 为独立制定的预期结果，运行测试不会生成或覆盖 B。 */
class JsonFormatterFixtureTest {
    private static final ObjectMapper STRICT_JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(DeserializationFeature.USE_BIG_INTEGER_FOR_INTS);

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    void matchesExpectedOutputAndPreservesInput(Fixture fixture) throws IOException, URISyntaxException {
        Path root = fixtureRoot();
        String input = read(root.resolve("A").resolve(fixture.filename()));
        String expected = read(root.resolve("B").resolve(fixture.filename()));
        String actual = JsonFormatter.format(input);
        JsonNode originalJson = parseOrNull(input);
        JsonNode formattedJson = parseOrNull(actual);

        assertAll(fixture.toString(),
                () -> assertEquals(expected, actual, "格式化结果必须与 B 文件逐字符相同"),
                () -> assertEquals(nonWhitespace(input), nonWhitespace(actual), "不能增删或重排非空白字符"),
                () -> assertEquals(actual, JsonFormatter.format(actual), "重复格式化应得到相同结果"),
                () -> assertEquals(fixture.valid(), originalJson != null, "用例合法性声明应与严格解析一致"),
                () -> assertEquals(fixture.valid(), formattedJson != null, "不能修复或破坏原有 JSON 语法"),
                () -> assertEquals(originalJson, formattedJson, "合法 JSON 的数据应保持相同"));
    }

    @Test
    void directoriesAndManifestHaveMatchingConsecutiveNumbers() throws IOException, URISyntaxException {
        List<Fixture> fixtures = cases().toList();
        assertFalse(fixtures.isEmpty());
        List<String> identifiers = fixtures.stream().map(Fixture::id).toList();
        assertEquals(identifiers.size(), new HashSet<>(identifiers).size(), "编号不能重复");
        List<String> consecutive = IntStream.rangeClosed(1, fixtures.size())
                .mapToObj(index -> String.format(Locale.ROOT, "%02d", index)).toList();
        assertEquals(consecutive, identifiers, "清单编号必须从 01 连续递增");
        Set<String> expected = new HashSet<>(fixtures.stream().map(Fixture::filename).toList());
        assertEquals(expected, filenames(fixtureRoot().resolve("A")));
        assertEquals(expected, filenames(fixtureRoot().resolve("B")));
        assertTrue(fixtures.stream().allMatch(fixture -> !fixture.name().isBlank()), "每个编号应说明场景");
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2, 3, 4, 5, 6, 7, 8})
    void customIndentationPreservesStringWhitespace(int width) {
        String indent = " ".repeat(width);
        String input = "{\"text\":\"  a b  \",\"items\":[1]}";
        String expected = "{\n" + indent + "\"text\": \"  a b  \",\n" + indent + "\"items\": [\n"
                + indent.repeat(2) + "1\n" + indent + "]\n}";
        String actual = JsonFormatter.format(input, width);

        assertEquals(expected, actual);
        assertEquals(actual, JsonFormatter.format(actual, width));
        assertEquals(parseOrNull(input), parseOrNull(actual));
    }

    @ParameterizedTest
    @ValueSource(ints = {Integer.MIN_VALUE, -1, 9, Integer.MAX_VALUE})
    void rejectsInvalidIndentationEvenForNullInput(int width) {
        assertThrows(IllegalArgumentException.class, () -> JsonFormatter.format("{}", width));
        assertThrows(IllegalArgumentException.class, () -> JsonFormatter.format(null, width));
    }

    @Test
    void concurrentCallsKeepTheirStateIndependent() throws IOException, URISyntaxException {
        Path root = fixtureRoot();
        List<Fixture> fixtures = cases().filter(fixture -> Integer.parseInt(fixture.id()) <= 80).toList();
        List<String> inputs = new ArrayList<>();
        List<String> expected = new ArrayList<>();
        for (Fixture fixture : fixtures) {
            inputs.add(read(root.resolve("A").resolve(fixture.filename())));
            expected.add(read(root.resolve("B").resolve(fixture.filename())));
        }
        IntStream.range(0, inputs.size() * 4).parallel().forEach(index -> {
            int fixtureIndex = index % inputs.size();
            assertEquals(expected.get(fixtureIndex), JsonFormatter.format(inputs.get(fixtureIndex)),
                    fixtures.get(fixtureIndex).toString());
        });
    }

    @Test
    void everyTruncatedPrefixPreservesTokensAndSyntaxStatus() {
        String complete = "{\"text\":\"x\\\"y\\\\z\\u0041\",\"items\":[-1.25e+3,true,null,{\"empty\":[]}]}";
        for (int end = 0; end <= complete.length(); end++) {
            String prefix = complete.substring(0, end);
            String formatted = JsonFormatter.format(prefix);
            String context = "截断位置 " + end;
            assertAll(context,
                    () -> assertEquals(nonWhitespace(prefix), nonWhitespace(formatted), context),
                    () -> assertEquals(formatted, JsonFormatter.format(formatted), context),
                    () -> assertEquals(parseOrNull(prefix), parseOrNull(formatted), context));
        }
    }

    private static Stream<Fixture> cases() throws IOException, URISyntaxException {
        JsonNode manifest = STRICT_JSON.readTree(read(fixtureRoot().resolve("cases.json")));
        List<Fixture> fixtures = new ArrayList<>();
        for (JsonNode item : manifest.required("cases")) {
            fixtures.add(new Fixture(item.required("id").asText(), item.required("name").asText(),
                    item.required("valid").asBoolean()));
        }
        return fixtures.stream();
    }

    private static Path fixtureRoot() throws URISyntaxException {
        return Path.of(Objects.requireNonNull(JsonFormatterFixtureTest.class.getResource("/json-formatter"),
                "缺少 json-formatter 测试资源").toURI());
    }

    private static Set<String> filenames(Path directory) throws IOException {
        try (Stream<Path> files = Files.list(directory)) {
            Set<String> filenames = new HashSet<>();
            for (Path file : files.toList()) {
                assertTrue(Files.isRegularFile(file), "A/B 目录只能包含用例文件");
                String name = file.getFileName().toString();
                assertTrue(name.matches("\\d{2}\\.json"), "文件名应为两位数字编号：" + name);
                filenames.add(name);
            }
            return filenames;
        }
    }

    private static String read(Path path) throws IOException {
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    private static JsonNode parseOrNull(String source) {
        try {
            JsonNode parsed = STRICT_JSON.readTree(source);
            return parsed == null || parsed.isMissingNode() ? null : parsed;
        } catch (JsonProcessingException error) {
            return null;
        }
    }

    private static String nonWhitespace(String source) {
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < source.length(); index++) {
            char character = source.charAt(index);
            if (character != ' ' && character != '\t' && character != '\r' && character != '\n') {
                result.append(character);
            }
        }
        return result.toString();
    }

    private record Fixture(String id, String name, boolean valid) {
        private String filename() {
            return id + ".json";
        }

        @Override
        public String toString() {
            return id + " " + name;
        }
    }
}
