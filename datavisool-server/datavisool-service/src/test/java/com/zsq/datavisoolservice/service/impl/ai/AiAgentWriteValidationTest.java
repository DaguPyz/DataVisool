/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import org.junit.jupiter.api.Test;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.zsq.datavisoolservice.service.impl.ai.AiAgentDataValidation.*;

class AiAgentWriteValidationTest {
    private Map<String, Object> contract(String source) {
        return Map.of("componentId", "chart", "componentType", "AntdBaseColumn", "supportsDataInput", true, "contractSourceType", source,
                "currentData", Map.of("valueExample", List.of(Map.of("name", "A", "value", 1))), "fieldMapping", Map.of("xField", "name", "yField", "value"));
    }
    private Map<String, Object> staticData(Object value) {return Map.of("sourceType", "static", "staticData", Map.of("value", value));}
    private void create(String type, Map<String, Object> config, boolean supports, boolean defaults) {
        validateCreate(type, config, supports, Set.of(), defaults);
    }
    private void change(Object data, Map<String, Object> style, Map<String, Object> contract) {
        validateChange("chart", "AntdBaseColumn", data, style, contract);
    }
    @Test void dataAndMappingChangesRequireExplicitComponentContract() {
        assertEquals("agent.operation.component_data_contract_required", assertThrows(Violation.class,
                () -> change(staticData(List.of()), Map.of(), Map.of())).validationCode);
        assertThrows(Violation.class, () -> change(null, Map.of("xField", "category"), Map.of()));
    }
    @Test void contractQueriesNormalizeIdsAndDefaultsBeforeMatchingHostResults() {
        var request = new LinkedHashMap<String, Object>(Map.of("componentIds", List.of(" chart ", "chart", "")));
        normalizeContractRequest(request);
        assertEquals(List.of("chart"), request.get("componentIds")); assertEquals("static", request.get("sourceType"));
        assertThrows(Violation.class, () -> normalizeContractRequest(new LinkedHashMap<>(Map.of("componentIds", List.of("a", "b", "c", "d", "e")))));
        assertThrows(Violation.class, () -> normalizeContractRequest(new LinkedHashMap<>(Map.of("componentIds", List.of("chart"), "sourceType", "unsupported"))));
    }
    @Test void sourceAndTypeMustMatchTheLastReadContract() {
        assertEquals("agent.operation.component_data_contract_source_mismatch", assertThrows(Violation.class,
                () -> change(Map.of("sourceType", "api", "apiData", Map.of("url", "https://example.com")), Map.of(), contract("static"))).validationCode);
        var wrong = new LinkedHashMap<>(contract("static")); wrong.put("componentType", "BaseText");
        assertEquals("agent.operation.component_data_contract_type_mismatch", assertThrows(Violation.class,
                () -> change(staticData(List.of()), Map.of(), wrong)).validationCode);
    }
    @Test void renamedDataAndMappingsMustBeUpdatedTogetherAndEveryRowIsChecked() {
        var value = List.of(Map.of("category", "A", "amount", 1), Map.of("category", "B", "amount", 2));
        assertThrows(Violation.class, () -> change(staticData(value), Map.of(), contract("static")));
        assertDoesNotThrow(() -> change(staticData(value), Map.of("xField", "category", "yField", "amount"), contract("static")));
        assertThrows(Violation.class, () -> change(staticData(List.of(value.get(0), Map.of("category", "B"))),
                Map.of("xField", "category", "yField", "amount"), contract("static")));
    }
    @Test void mappingOnlyChangesUseTheCurrentValueAndRejectEmptyOrNonStringNames() {
        assertDoesNotThrow(() -> change(null, Map.of("xField", "name"), contract("static")));
        for (Object value : List.of("missing", "", List.of("name"), 1))
            assertThrows(Violation.class, () -> change(null, Map.of("xField", value), contract("static")));
    }
    @Test void dynamicConnectionsDoNotCompareMappingsToUnknownRuntimeRows() {
        assertDoesNotThrow(() -> change(Map.of("sourceType", "api", "apiData", Map.of("url", "https://example.com", "method", "get")),
                Map.of("xField", "futureCategory"), contract("api")));
    }
    @Test void allSevenDataSourcesUseTheirOwnAllowedBranchAndTypes() {
        var branches = Map.of("static", "staticData", "api", "apiData", "database", "database", "commonApi", "commonApi",
                "globalVariable", "globalVariable", "webSocket", "webSocket", "mqtt", "mqtt");
        var fields = Map.of("static", Map.of("value", "标题"), "api", Map.of("url", "https://example.com", "method", "get"),
                "database", Map.of("targetDb", "db", "sql", "select 1"), "commonApi", Map.of("commonApiId", "api"),
                "globalVariable", Map.of("gvId", "variable"), "webSocket", Map.of("url", "wss://example.com"), "mqtt", Map.of("qos", 2, "host", "wss://example.com"));
        for (var entry : branches.entrySet()) {
            assertEquals(entry.getKey(), sourceType(Map.of("sourceType", entry.getKey(), entry.getValue(), fields.get(entry.getKey()))));
            assertThrows(Violation.class, () -> sourceType(Map.of("sourceType", entry.getKey(), entry.getValue(), fields.get(entry.getKey()), "value", 1)));
        }
        assertThrows(Violation.class, () -> sourceType(Map.of("sourceType", "mqtt", "mqtt", Map.of("qos", 1.5))));
        assertThrows(Violation.class, () -> sourceType(Map.of("sourceType", "api", "apiData", Map.of("method", "GET"))));
        assertThrows(Violation.class, () -> sourceType(Map.of("sourceType", "api", "staticData", Map.of("value", "wrong"))));
    }
    @Test void structuredDataErrorsReportTheNestedFieldActualTypeAndAllowedRange() {
        var error = assertThrows(Violation.class, () -> sourceType(Map.of("sourceType", "mqtt",
                "mqtt", Map.of("qos", 3)), "components[2].config.data"));
        var feedback = error.result();
        assertEquals("components[2].config.data.mqtt.qos", feedback.get("fieldPath"));
        assertEquals(3, feedback.get("actualValue"));
        assertEquals("number", feedback.get("actualType"));
        assertEquals(Map.of("type", "integer", "min", 0, "max", 2), feedback.get("expected"));

        var missing = assertThrows(Violation.class, () -> sourceType(Map.of("staticData", Map.of("value", "x")),
                "components[0].config.data"));
        assertEquals("components[0].config.data.sourceType", missing.result().get("fieldPath"));
        assertEquals("missing", missing.result().get("actualType"));
        assertTrue(((Map<?, ?>) missing.result().get("expected")).containsKey("allowedValues"));

        var wrongBranch = assertThrows(Violation.class,
                () -> sourceType(Map.of("sourceType", "static", "staticData", List.of("kept", "complete"))));
        assertEquals(List.of("kept", "complete"), wrongBranch.result().get("actualValue"));
        assertEquals("array", wrongBranch.result().get("actualType"));
    }
    @Test void credentialsDangerousKeysAndExpressionsCannotEnterDataConfig() {
        for (Object data : List.of(Map.of("password", "hidden"), Map.of("__proto__", "x"), "${expression}", "function callback() {}"))
            assertThrows(Violation.class, () -> sourceType(staticData(data)));
        for (String url : List.of("https://user:password@example.com/data", "https://example.com/data?access_token=hidden"))
            assertThrows(Violation.class, () -> sourceType(Map.of("sourceType", "api", "apiData", Map.of("url", url))));
    }
    @Test void creationRequiresActualBusinessDataAndRecognizesPieMappingsAndDynamicText() {
        assertThrows(Violation.class, () -> create("DigitalFlipper", Map.of("style", Map.of()), true, false));
        assertThrows(Violation.class, () -> create("DigitalFlipper", Map.of(), true, true));
        assertThrows(Violation.class, () -> create("BaseButton", Map.of("data", staticData("value")), false, false));
        assertThrows(Violation.class, () -> create("BaseText", Map.of("data", staticData(List.of("value"))), true, false));
        assertDoesNotThrow(() -> create("BaseText", Map.of("data", Map.of("sourceType", "api", "apiData", Map.of("url", "https://example.com"))), true, false));
        assertDoesNotThrow(() -> validateCreate("AntdPie", Map.of("data", staticData(List.of(Map.of("type", "A", "value", 10))),
                "style", Map.of("angleField", "value", "colorField", "type")), true, Set.of("angleField", "colorField"), false));
        assertThrows(Violation.class, () -> validateCreate("AntdBaseColumn", Map.of("data", staticData(List.of(Map.of("name", "A", "value", 1))),
                "style", Map.of("isStack", true)), true, Set.of("xField", "yField"), false));
    }
    private Map<String, Object> schema(String componentDirectory, String type) throws Exception {
        return ComponentDocumentParser.firstJson(ComponentDocumentParser.section(Files.readString(
                Path.of("../../datavisool-app/src/comps/" + componentDirectory + "/" + type + ".md")), "校验规则"));
    }
    @Test void actualChartRulesRejectMixedNumericArraysAndValuesOutsideTheRange() throws Exception {
        var schema = schema("antd/column-base", "AntdBaseColumn");
        assertDoesNotThrow(() -> AiAgentStyleValidation.validate(Map.of("padding", "auto", "appendPadding", List.of(10, 20), "color", List.of("#fff", "#000")), schema));
        for (Map<String, Object> style : List.of(Map.<String, Object>of("padding", List.of(10, "auto")), Map.<String, Object>of("appendPadding", List.of(10, 600)),
                Map.<String, Object>of("color", List.of("#fff", 1)), Map.<String, Object>of("color", Map.of("value", "#fff"))))
            assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(style, schema));
    }
    @Test void actualTableRulesCheckArrayElementsAndNestedAllowedFields() throws Exception {
        var schema = schema("builtin/base-table", "LcBaseTable");
        assertDoesNotThrow(() -> AiAgentStyleValidation.validate(Map.of("columns", List.of(Map.of("key", "name", "label", "名称", "width", 120))), schema));
        assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(Map.of("columns", List.of("name")), schema));
        assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(Map.of("columns", List.of(Map.of("key", "name", "unregistered", true))), schema));
        assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(Map.of("header", Map.of()), schema));
    }
    @Test void functionConfigEnumsNullAndArrayCountAreEnforced() throws Exception {
        var schema = schema("builtin/base-text", "BaseText");
        assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(Map.of("fontFamily", "value => value"), schema));
        assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(Map.of("textAlign", "wrong"), schema));
        var arraySchema = Map.<String, Object>of("schemaVersion", "component-style-doc/v1", "allowedStylePaths", List.of(Map.of("path", "style.items", "type", "array", "minItems", 1, "maxItems", 2)));
        assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(Map.of("items", List.of()), arraySchema));
        assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(Map.of("items", List.of(1, 2, 3)), arraySchema));
        var nullable = new HashMap<String, Object>(); nullable.put("fontSize", null);
        assertThrows(Violation.class, () -> AiAgentStyleValidation.validate(nullable, schema));
    }
    @Test void styleErrorsReportTheActualValueAndDeclaredEnumOrBounds() {
        var enumSchema = Map.<String, Object>of("schemaVersion", "component-style-doc/v1", "allowedStylePaths",
                List.of(Map.of("path", "style.textAlign", "type", "string", "enumValues", List.of("left", "center"))));
        var enumError = assertThrows(Violation.class,
                () -> AiAgentStyleValidation.validate(Map.of("textAlign", "justify"), enumSchema));
        var enumFeedback = enumError.result();
        assertEquals("style.textAlign", enumFeedback.get("fieldPath"));
        assertEquals("justify", enumFeedback.get("actualValue"));
        assertEquals("string", enumFeedback.get("actualType"));
        assertEquals(List.of("left", "center"), ((Map<?, ?>) enumFeedback.get("expected")).get("allowedValues"));

        var rangeSchema = Map.<String, Object>of("schemaVersion", "component-style-doc/v1", "allowedStylePaths",
                List.of(Map.of("path", "style.opacity", "type", "number", "min", 0, "max", 1)));
        var rangeError = assertThrows(Violation.class,
                () -> AiAgentStyleValidation.validate(Map.of("opacity", 1.5), rangeSchema));
        assertEquals(1.5, rangeError.result().get("actualValue"));
        assertEquals(Map.of("min", 0, "max", 1), rangeError.result().get("expected"));

        var reversedItemsSchema = Map.<String, Object>of("schemaVersion", "component-style-doc/v1", "allowedStylePaths",
                List.of(Map.of("path", "style.items", "type", "array", "minItems", 3, "maxItems", 2)));
        var reversedItems = assertThrows(Violation.class,
                () -> AiAgentStyleValidation.validate(Map.of(), reversedItemsSchema));
        assertEquals("allowedStylePaths[0]", reversedItems.result().get("fieldPath"));
        assertEquals(Map.of("minItems", 3, "maxItems", 2), reversedItems.result().get("actualValue"));
        assertEquals(Map.of("constraint", "minItems <= maxItems"), reversedItems.result().get("expected"));

        var itemRangeSchema = Map.<String, Object>of("schemaVersion", "component-style-doc/v1", "allowedStylePaths",
                List.of(Map.of("path", "style.items", "type", "array", "minItems", 1, "maxItems", 2)));
        var itemRange = assertThrows(Violation.class,
                () -> AiAgentStyleValidation.validate(Map.of("items", List.of("a", "b", "c")), itemRangeSchema));
        assertEquals("style.items", itemRange.result().get("fieldPath"));
        assertEquals(List.of("a", "b", "c"), itemRange.result().get("actualValue"));
        assertEquals("array", itemRange.result().get("actualType"));
        assertEquals(3, itemRange.result().get("actualCount"));
        assertEquals(Map.of("type", "array", "minItems", 1, "maxItems", 2), itemRange.result().get("expected"));
    }
}
