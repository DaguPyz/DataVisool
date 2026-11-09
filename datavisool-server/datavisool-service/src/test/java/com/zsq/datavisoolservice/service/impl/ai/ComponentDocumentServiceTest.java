/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.mapper.RemoteComponentDocumentMapper;
import com.zsq.datavisoolservice.mapper.RemoteComponentMapper;
import com.zsq.datavisoolservice.model.po.RemoteComponentDocumentPO;
import com.zsq.datavisoolservice.model.po.RemoteComponentPO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Proxy;

class ComponentDocumentServiceTest {
    @TempDir Path root;
    Path published = Path.of("target/component-docs");
    Map<String, Object> index;
    ComponentDocumentService service;
    RemoteComponentDocumentMapper documents;
    RemoteComponentMapper components;
    String version;
    List<RemoteComponentDocumentPO> saved;
    RemoteComponentPO visibleParent;

    @BeforeEach void setup() throws Exception {
        version = JSON.parseObject(Files.readString(published.resolve("current.json"))).getString("corpusVersion");
        Path corpus = published.resolve("builtin").resolve(version);
        index = JSON.parseObject(Files.readString(corpus.resolve("index.json")));
        try (var files = Files.walk(corpus)) {
            for (Path file : files.filter(Files::isRegularFile).toList()) {
                Path target = root.resolve("builtin").resolve(version).resolve(corpus.relativize(file));
                Files.createDirectories(target.getParent()); Files.copy(file, target);
            }
        }
        Files.copy(published.resolve("current.json"), root.resolve("current.json"));
        saved = new ArrayList<>();
        documents = (RemoteComponentDocumentMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{RemoteComponentDocumentMapper.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "insert" -> {saved.add((RemoteComponentDocumentPO) args[0]); yield 1;}
                    case "selectOne" -> saved.isEmpty() ? null : saved.get(0);
                    case "selectList" -> saved;
                    case "selectCount" -> (long) saved.size();
                    case "deletedDocuments" -> List.of();
                    default -> throw new UnsupportedOperationException(method.getName());
                });
        components = (RemoteComponentMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{RemoteComponentMapper.class},
                (proxy, method, args) -> visibleParent);
        service = new ComponentDocumentService(root.toString(), documents, components);
    }
    @SuppressWarnings("unchecked") List<Map<String, Object>> entries() {return (List<Map<String, Object>>) index.get("documents");}
    Map<String, Object> descriptor(String type) {
        var entry = entries().stream().filter(doc -> type.equals(doc.get("componentType"))).findFirst().orElseThrow();
        return Map.of("componentType", type, "source", "builtin", "componentVersion", entry.get("componentVersion"), "corpusVersion", version);
    }
    Map<String, Object> request(List<String> types, String intent) {
        Map<String, Object> result = new LinkedHashMap<>(); result.put("componentTypes", types); result.put("intent", intent);
        result.put("catalog", types.stream().map(this::descriptor).toList()); return result;
    }
    @SuppressWarnings("unchecked") Map<String, Object> resolve(List<String> types, String intent) {
        return (Map<String, Object>) service.execute("resolve_component_specs", request(types, intent), 7L);
    }
    Path file(String type) {return root.resolve("builtin").resolve(version).resolve("components/" + type + "/" + type + ".md");}

    @Test void all48CreateAndPatchSpecsRemainComplete() {
        int count = 0;
        for (var entry : entries()) if (Boolean.TRUE.equals(entry.get("hasFullSpec"))) {
            String type = String.valueOf(entry.get("componentType")); count++;
            var created = resolve(List.of(type), "create"); var patched = resolve(List.of(type), "patch");
            assertFalse(ComponentDocumentParser.cast((Map<?, ?>) ((Map<?, ?>) ((List<?>) created.get("specs")).get(0)).get("configurable")).isEmpty());
            assertEquals(1, AiAgentComponentSpecs.completeEvidence(request(List.of(type), "create"), created).size());
            assertEquals(1, AiAgentComponentSpecs.completeEvidence(request(List.of(type), "patch"), patched).size());
            assertTrue(JSON.toJSONBytes(created).length < 256 * 1024);
            var spec = ComponentDocumentParser.cast((Map<?, ?>) ((List<?>) created.get("specs")).get(0));
            assertTrue(spec.get("supportsDataInput") instanceof Boolean, type);
            assertTrue(spec.get("dataRequirements").toString().contains("该组件"), type);
            var patchSpec = ComponentDocumentParser.cast((Map<?, ?>) ((List<?>) patched.get("specs")).get(0));
            assertEquals(spec.get("supportsDataInput"), patchSpec.get("supportsDataInput"), type);
            assertEquals(spec.get("dataRequirements"), patchSpec.get("dataRequirements"), type);
            service.verifyResultIdentities(created, 7L);
        }
        assertEquals(48, count);
    }
    @Test void contradictoryOrMissingDataDeclarationsCannotProduceSpecifications() throws Exception {
        String content = Files.readString(file("BaseText"));
        String declaration = "该组件支持通过 `dataPatch` 修改数据。";
        for (String replacement : List.of("", declaration + "\n该组件不支持通过 `dataPatch` 修改数据。"))
            assertThrows(ComponentDocumentParser.DocumentException.class,
                    () -> ComponentDocumentParser.fullSpec(content.replace(declaration, replacement), "create"));
    }
    @Test void all48DocumentedCreateExamplesPassTheSameBusinessRules() {
        for (var entry : entries()) if (Boolean.TRUE.equals(entry.get("hasFullSpec"))) {
            String type = String.valueOf(entry.get("componentType"));
            var resolved = resolve(List.of(type), "create");
            var spec = ComponentDocumentParser.cast((Map<?, ?>) ((List<?>) resolved.get("specs")).get(0));
            var config = ComponentDocumentParser.cast((Map<?, ?>) ComponentDocumentParser.cast((Map<?, ?>) spec.get("example")).get("config"));
            var evidence = AiAgentComponentSpecs.completeEvidence(request(List.of(type), "create"), resolved);
            var payload = Map.<String, Object>of("components", List.of(Map.of("type", type, "config", config)));
            for (String operation : List.of("create_canvas_components", "render_draft"))
                for (var readEvidence : List.of(evidence, List.<Map<String, Object>>of()))
                    assertDoesNotThrow(() -> service.validateWrite(operation, payload, readEvidence, 7L), type + " " + operation);
            boolean supports = Boolean.TRUE.equals(spec.get("supportsDataInput"));
            var defaults = Map.<String, Object>of("components", List.of(Map.of("type", type, "useDefaultConfig", true)));
            if (supports) {
                assertEquals("agent.operation.data_component_default_config_forbidden", assertThrows(AiAgentDataValidation.Violation.class,
                        () -> service.validateWrite("create_canvas_components", defaults, evidence, 7L), type).validationCode);
                var missing = new LinkedHashMap<>(config); missing.remove("data");
                assertEquals("agent.operation.create_data_required", assertThrows(AiAgentDataValidation.Violation.class,
                        () -> service.validateWrite("create_canvas_components", Map.of("components", List.of(Map.of("type", type, "config", missing))), evidence, 7L), type).validationCode);
                if (!ComponentDocumentParser.mappingFields(spec.get("dataRequirements").toString()).isEmpty()) {
                    var unmapped = new LinkedHashMap<>(config);
                    var style = new LinkedHashMap<>(ComponentDocumentParser.cast((Map<?, ?>) config.get("style")));
                    style.keySet().removeAll(AiAgentDataValidation.MAPPING_KEYS); unmapped.put("style", style);
                    assertEquals("agent.operation.create_field_mapping_required", assertThrows(AiAgentDataValidation.Violation.class,
                            () -> service.validateWrite("create_canvas_components", Map.of("components", List.of(Map.of("type", type, "config", unmapped))), evidence, 7L), type).validationCode);
                }
            } else {
                assertDoesNotThrow(() -> service.validateWrite("create_canvas_components", defaults, evidence, 7L), type);
                var extra = new LinkedHashMap<>(config); extra.put("data", Map.of("sourceType", "static", "staticData", Map.of("value", "unexpected")));
                assertEquals("agent.operation.data_patch_not_allowed", assertThrows(AiAgentDataValidation.Violation.class,
                        () -> service.validateWrite("create_canvas_components", Map.of("components", List.of(Map.of("type", type, "config", extra))), evidence, 7L), type).validationCode);
            }
        }
    }
    @Test void scalarChartsAndNativeButtonReachFrontendWithoutInventedDataOrMappings() {
        for (String type : List.of("BaseButton", "AntdGauge", "AntdLiquid", "AntdRingProgress")) {
            var resolved = resolve(List.of(type), "create");
            var spec = ComponentDocumentParser.cast((Map<?, ?>) ((List<?>) resolved.get("specs")).get(0));
            var config = ComponentDocumentParser.cast((Map<?, ?>) ComponentDocumentParser.cast((Map<?, ?>) spec.get("example")).get("config"));
            var evidence = AiAgentComponentSpecs.completeEvidence(request(List.of(type), "create"), resolved);
            var agent = new AiAgentService() {
                @Override List<Map<String, Object>> componentSpecEvidence(AgentExecutionContext context) {return evidence;}
                @Override List<Map<String, Object>> componentDataContractEvidence(AgentExecutionContext context) {return List.of();}
                @Override com.zsq.datavisoolservice.model.po.AiAgentOperationPO findOperation(String id) {return null;}
            };
            var reached = new ArrayList<String>();
            var catalog = new AiAgentToolCatalog(agent, (context, operation, payload, revision) -> {
                reached.add(operation);
                return new AiAgentService.OperationView("op", operation, "pending", Map.of(), revision, "", 0L);
            }, new AiAgentWorkspaceService(root.resolve("workspace-" + type)), service);
            var context = new AiAgentService.AgentExecutionContext("thread", "1", "turn", "run", "7", "", Map.of(), Map.of(), Map.of(), null, null, 0);
            var component = Map.of("id", "item", "type", type, "x", 0, "y", 0, "width", 180, "height", 60, "config", config);
            var call = dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("create").name("create_canvas_components")
                    .arguments(JSON.toJSONString(Map.of("components", List.of(component)))).build();
            var ready = StagedToolTestSupport.validate(catalog, call.name(), call.arguments(), context);
            assertEquals("validated", ready.status(), type + " " + ready.result());
            var result = StagedToolTestSupport.submit(catalog, call.name(), ready, context);
            assertEquals("pending", result.status(), type + " " + result.result());
            assertEquals(List.of("create_canvas_components"), reached, type);
            var invalidConfig = new LinkedHashMap<>(config);
            if (type.equals("BaseButton")) invalidConfig.put("data", Map.of("sourceType", "static", "staticData", Map.of("value", "unexpected")));
            else {invalidConfig.remove("data"); invalidConfig.putIfAbsent("style", Map.of());}
            var invalidComponent = new LinkedHashMap<>(component); invalidComponent.put("config", invalidConfig);
            var invalidCall = dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("invalid-create").name("create_canvas_components")
                    .arguments(JSON.toJSONString(Map.of("components", List.of(invalidComponent)))).build();
            var invalidResult = StagedToolTestSupport.validate(catalog, invalidCall.name(), invalidCall.arguments(), context);
            assertEquals("repair_required", invalidResult.status(), type);
            assertEquals(type.equals("BaseButton") ? "agent.operation.data_patch_not_allowed" : "agent.operation.create_data_required",
                    invalidResult.result().get("code"), type);
            assertEquals(List.of("create_canvas_components"), reached, "invalid config reached frontend: " + type);
        }
    }
    @Test void unrelatedDocumentsAreNeverRequiredAndSubsequentReadsObserveFileChanges() throws Exception {
        Files.delete(file("AntdBaseArea"));
        assertNotNull(resolve(List.of("BaseText"), "create"));
        Files.writeString(file("BaseText"), "changed");
        var error = assertThrows(ComponentDocumentParser.DocumentException.class, () -> resolve(List.of("BaseText"), "create"));
        assertEquals("agent.component_specs.version_mismatch", error.code);
    }
    @Test void sectionPaginationReturnsOnlySelectedChapter() {
        Map<String, Object> request = new LinkedHashMap<>(Map.of("componentType", "BaseText", "section", "组件选择", "catalog", List.of(descriptor("BaseText"))));
        var result = (Map<?, ?>) service.execute("get_component_document", request, 7L);
        assertTrue(result.get("content").toString().contains("## 组件选择"));
        assertFalse(result.get("content").toString().contains("## 完整规格"));
        assertTrue(((List<?>) result.get("availableSections")).contains("组件选择"));
        request.put("section", "不存在");
        var error = assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.execute("get_component_document", request, 7L));
        assertTrue(error.getMessage().contains("可用章节："));
    }
    @Test void agentWriteErrorIdentifiesTheComponentAndMissingMappedDataField() {
        var payload = Map.<String, Object>of("components", List.of(Map.of("id", "chart-1", "type", "AntdBaseColumn",
                "config", Map.of("style", Map.of("xField", "missing"), "data",
                        Map.of("sourceType", "static", "staticData", Map.of("value", List.of(Map.of("name", "Ada"))))))));
        var error = assertThrows(AiAgentDataValidation.Violation.class,
                () -> service.validateWrite("create_canvas_components", payload, List.of(), 7L));
        var feedback = error.result();
        assertEquals("chart-1", feedback.get("componentId"));
        assertEquals("AntdBaseColumn", feedback.get("componentType"));
        assertEquals("components[0].config.data.staticData.value[0].missing", feedback.get("fieldPath"));
        assertEquals("missing", feedback.get("actualType"));
        assertEquals("components[0].config.style.xField", ((Map<?, ?>) feedback.get("expected")).get("mappingField"));
    }
    @Test void malformedDocumentFeedbackIncludesItsSourcePathSectionAndParseLocation() throws Exception {
        Path document = file("BaseText");
        String original = Files.readString(document);
        int sectionStart = original.indexOf("## 配置字段");
        int blockStart = original.indexOf("```json", sectionStart);
        int bodyStart = original.indexOf('\n', blockStart) + 1;
        int blockEnd = original.indexOf("```", bodyStart);
        String malformed = original.substring(0, bodyStart) + "{\"style\": }\n" + original.substring(blockEnd);
        Files.writeString(document, malformed);
        var entry = entries().stream().filter(item -> "BaseText".equals(item.get("componentType"))).findFirst().orElseThrow();
        entry.put("sha256", ComponentDocumentParser.hash(malformed));
        Files.writeString(root.resolve("builtin").resolve(version).resolve("index.json"), JSON.toJSONString(index));

        var error = assertThrows(ComponentDocumentParser.DocumentException.class,
                () -> resolve(List.of("BaseText"), "create"));
        var feedback = error.result();
        assertEquals("BaseText", feedback.get("componentType"));
        assertEquals("builtin", feedback.get("source"));
        assertEquals("components/BaseText/BaseText.md", feedback.get("path"));
        assertEquals("配置字段", feedback.get("section"));
        assertEquals("jsonBlock[1]", feedback.get("fieldPath"));
        assertTrue(feedback.get("parseLine") instanceof Number);
        assertTrue(feedback.containsKey("reason"));
        assertTrue(feedback.containsKey("expected"));
    }
    @Test void documentPaginationProvidesTheNextRequestWithoutGuessing() {
        var request = new LinkedHashMap<String, Object>(Map.of("componentType", "BaseText", "lineCount", 2,
                "catalog", List.of(descriptor("BaseText"))));
        var first = (Map<?, ?>) service.execute("get_component_document", request, 7L);
        assertEquals(true, first.get("hasMore"));
        assertEquals(3, first.get("nextStartLine"));
        request.put("startLine", first.get("nextStartLine"));
        var second = (Map<?, ?>) service.execute("get_component_document", request, 7L);
        assertEquals(3, second.get("startLine"));
        request.put("startLine", second.get("totalLines"));
        var last = (Map<?, ?>) service.execute("get_component_document", request, 7L);
        assertEquals(false, last.get("hasMore"));
        assertNull(last.get("nextStartLine"));
    }
    @Test void searchAndBatchLimitsAreBounded() {
        var request = new LinkedHashMap<String, Object>(Map.of("query", "fontSize", "maxResults", 2, "catalog", List.of(descriptor("BaseText"))));
        var result = (Map<?, ?>) service.execute("search_component_documents", request, 7L);
        assertEquals(2, ((List<?>) result.get("matches")).size());
        assertEquals(1, result.get("scannedDocuments"));
        assertTrue((Boolean) result.get("scanLimited"));
        assertThrows(RuntimeException.class, () -> resolve(entries().stream().limit(11).map(d -> d.get("componentType").toString()).toList(), "create"));
    }
    @Test void commonFragmentsAreLimitedToActualReferencesAndDeduplicated() {
        assertTrue(((Map<?, ?>) resolve(List.of("BaseText"), "create").get("commonFragments")).isEmpty());
        var result = resolve(List.of("AntdBaseArea", "AntdGroupColumn"), "create");
        var fragments = (Map<?, ?>) result.get("commonFragments");
        assertTrue(fragments.containsKey("<g2plot-axis>")); assertFalse(fragments.containsKey("<g2plot-word-cloud>"));
        assertEquals(fragments, resolve(List.of("AntdGroupColumn", "AntdBaseArea"), "create").get("commonFragments"));
    }
    @Test void writeCanSkipSpecReadsButStillValidatesRulesAndDocumentIntegrity() throws Exception {
        Map<String, Object> payload = Map.of("components", List.of(Map.of("type", "BaseText", "config", Map.of("style", Map.of("fontSize", 20),
                "data", Map.of("sourceType", "static", "staticData", Map.of("value", "标题"))))));
        assertEquals(1, service.validateWrite("create_canvas_components", payload, List.of(), 7L).size());
        assertEquals(1, service.validateWrite("render_draft", payload, List.of(), 7L).size());
        var evidence = AiAgentComponentSpecs.completeEvidence(request(List.of("BaseText"), "create"), resolve(List.of("BaseText"), "create"));
        assertEquals(1, service.validateWrite("create_canvas_components", payload, evidence, 7L).size());
        var invalid = Map.<String, Object>of("components", List.of(Map.of("type", "BaseText", "config", Map.of("style", Map.of("fontSize", 300),
                "data", Map.of("sourceType", "static", "staticData", Map.of("value", "标题"))))));
        assertThrows(AiAgentDataValidation.Violation.class, () -> service.validateWrite("create_canvas_components", invalid, evidence, 7L));
        assertThrows(AiAgentDataValidation.Violation.class, () -> service.validateWrite("create_canvas_components", invalid, List.of(), 7L));
        var incomplete = Map.<String, Object>of("components", List.of(Map.of("type", "BaseText", "config", Map.of("style", Map.of("fontSize", 20)))));
        assertEquals("agent.operation.create_data_required", assertThrows(AiAgentDataValidation.Violation.class,
                () -> service.validateWrite("create_canvas_components", incomplete, List.of(), 7L)).validationCode);
        var wrongIdentity = new LinkedHashMap<>(documentIdentity("BaseText")); wrongIdentity.put("sha256", "old-version");
        var wrongEvidence = List.of(Map.<String, Object>of("componentType", "BaseText", "intent", "create", "documentIdentity", wrongIdentity));
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.validateWrite("create_canvas_components", payload, wrongEvidence, 7L));
        Files.writeString(file("BaseText"), "changed");
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.validateWrite("create_canvas_components", payload, evidence, 7L));
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.validateWrite("create_canvas_components", payload, List.of(), 7L));
    }
    @Test void repairedFileCanBeSubmittedWithoutReadingSpecsAgain() {
        var agent = new AiAgentService() {
            @Override List<Map<String, Object>> componentSpecEvidence(AgentExecutionContext context) {return List.of();}
            @Override List<Map<String, Object>> componentDataContractEvidence(AgentExecutionContext context) {return List.of();}
            @Override com.zsq.datavisoolservice.model.po.AiAgentOperationPO findOperation(String id) {return null;}
        };
        var writes = new ArrayList<Map<String, Object>>();
        var workspace = new AiAgentWorkspaceService(root.resolve("workspace"));
        var catalog = new AiAgentToolCatalog(agent, (context, operation, payload, revision) -> {
            assertEquals("create_canvas_components", operation, "不应额外读取文件或规格"); writes.add(payload);
            return new AiAgentService.OperationView("op", operation, "pending", Map.of(), revision, "", 0L);
        }, workspace, service);
        var context = new AiAgentService.AgentExecutionContext("thread", "1", "turn", "run", "7", "", Map.of(), Map.of(), Map.of(), null, null, 0);
        String original = "[{\"id\":\"card\",\"type\":\"BaseColorBlock\",\"x\":0,\"y\":0,\"width\":450,\"height\":350,\"useDefaultConfig\":true]";
        var begin = catalog.execute(dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("begin").name("begin_canvas_artifact")
                .arguments(JSON.toJSONString(Map.of("toolName", "create_canvas_components"))).build(), context);
        var written = catalog.execute(dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("write").name("write_canvas_artifact")
                .arguments(JSON.toJSONString(Map.of("path", begin.result().get("path"), "expectedRevision", begin.result().get("workspaceRevision"),
                        "content", "{\"components\":" + original + "}"))).build(), context);
        var failed = catalog.execute(dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("validate").name("validate_canvas_artifact")
                .arguments(JSON.toJSONString(Map.of("path", written.result().get("path"), "expectedRevision", written.result().get("workspaceRevision")))).build(), context);
        assertEquals("repair_required", failed.status()); assertTrue(writes.isEmpty());
        assertTrue(failed.result().get("errorContext").toString().contains("true\n    ]"));
        var patch = dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("fix").name("repair_artifact")
                .arguments(JSON.toJSONString(Map.of("path", failed.result().get("path"), "expectedRevision", failed.result().get("workspaceRevision"),
                        "edits", List.of(Map.of("oldText", "true\n    ]", "newText", "true}\n    ]"))))).build();
        var repaired = catalog.execute(patch, context);
        assertEquals("validated", repaired.status(), repaired.asJson()); assertTrue(writes.isEmpty());
        var submitted = catalog.execute(dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("create").name("create_canvas_components")
                .arguments(JSON.toJSONString(Map.of("path", repaired.result().get("path"), "expectedRevision", repaired.result().get("workspaceRevision")))).build(), context);
        assertEquals("pending", submitted.status(), submitted.asJson()); assertEquals(1, writes.size());
        var identities = (List<?>) writes.get(0).get("componentDocumentIdentities");
        assertEquals("BaseColorBlock", ((Map<?, ?>) identities.get(0)).get("componentType"));
    }
    @Test void remotePackagesKeepVersionedFilesAndEnforceOwnershipAndDeletedState() throws Exception {
        Path pkg = root.resolve("package"); Files.createDirectories(pkg);
        Files.writeString(pkg.resolve("entry.js"), "// code");
        Files.writeString(pkg.resolve("RemoteText.md"), Files.readString(file("BaseText")).replace("BaseText", "RemoteText"));
        Files.writeString(pkg.resolve("manifest.json"), JSON.toJSONString(Map.of("componentType", "RemoteText", "componentVersion", "1.0.0",
                "documentFormatVersion", "component-document/v1", "documentPath", "RemoteText.md", "codeEntry", "entry.js")));
        var parent = new RemoteComponentPO(); parent.setId(42L); parent.setUserId(7L); parent.setUrl("pkg/entry.js");
        service.registerPackage(pkg, "pkg/entry.js", parent);
        var metadata = JSON.parseObject(saved.get(0).getIndexJson());
        assertTrue(Files.exists(root.resolve("remote/7/42").resolve(metadata.getString("componentVersion")).resolve("RemoteText.md")));
        visibleParent = parent;
        var req = new LinkedHashMap<String, Object>(Map.of("componentTypes", List.of("RemoteText"), "intent", "create", "catalog", List.of(metadata)));
        assertNotNull(service.execute("resolve_component_specs", req, 7L));
        var payload = Map.<String, Object>of("components", List.of(Map.of("type", "RemoteText", "config", Map.of("style", Map.of("fontSize", 20),
                "data", Map.of("sourceType", "static", "staticData", Map.of("value", "标题"))))));
        assertEquals("remote", service.validateWrite("create_canvas_components", payload, List.of(), 7L).get(0).get("source"));
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.validateWrite("create_canvas_components", payload, List.of(), 8L));
        parent.setUrl("new-package/entry.js");
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.validateWrite("create_canvas_components", payload, List.of(), 7L));
        parent.setUrl("pkg/entry.js");
        visibleParent = null;
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.execute("resolve_component_specs", req, 8L));
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.execute("resolve_component_specs", req, 7L));
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.validateWrite("create_canvas_components", payload, List.of(), 7L));
    }
    @Test void unsupportedDataWritesCannotUseStyleOnlySpecifications() {
        var evidence = AiAgentComponentSpecs.completeEvidence(request(List.of("BaseButton"), "patch"), resolve(List.of("BaseButton"), "patch"));
        var payload = Map.<String, Object>of("patches", List.of(Map.of("componentType", "BaseButton", "dataPatch", Map.of("sourceType", "static"))));
        var error = assertThrows(AiAgentDataValidation.Violation.class, () -> service.validateWrite("patch_canvas_components", payload, evidence, 7L));
        assertEquals("agent.operation.data_patch_not_allowed", error.validationCode);
    }
    @Test void invalidRemotePackagesCannotPublishIndex() throws Exception {
        Path pkg = root.resolve("bad-package"); Files.createDirectories(pkg);
        Files.writeString(pkg.resolve("manifest.json"), JSON.toJSONString(Map.of("componentType", "BaseText", "componentVersion", "1",
                "documentFormatVersion", "component-document/v1", "documentPath", "../outside.md", "codeEntry", "entry.js")));
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.inspectPackage(pkg));
        assertTrue(saved.isEmpty());
    }
    @SuppressWarnings("unchecked") Map<String, Object> documentIdentity(String type) {
        return (Map<String, Object>) ((Map<?, ?>) ((List<?>) resolve(List.of(type), "patch").get("specs")).get(0)).get("documentIdentity");
    }
    Map<String, Object> verifiedContract(String type, String id, String source) {
        var component = Map.of("componentId", id, "componentType", type, "documentIdentity", documentIdentity(type),
                "currentData", Map.of("valueExample", List.of(Map.of("name", "A", "value", 1))),
                "fieldMapping", type.startsWith("Antd") ? Map.of("xField", "name", "yField", "value") : Map.of());
        var response = Map.<String, Object>of("schemaVersion", "component-data-contract/v1", "sourceContract",
                Map.of("sourceType", source, "branch", source.equals("static") ? "staticData" : "apiData", "structure", Map.of()), "components", List.of(component));
        var verified = service.verifyDataContractResult(Map.of("componentIds", List.of(id), "sourceType", source), response, 7L);
        var contract = new LinkedHashMap<>(ComponentDocumentParser.cast((Map<?, ?>) ((List<?>) verified.get("components")).get(0)));
        contract.put("contractSourceType", source); return contract;
    }
    @Test void contractCapabilitiesComeFromFilesAndQueriesCannotGrantAnotherComponentsEvidence() {
        var contract = verifiedContract("BaseText", "text", "static");
        assertEquals(true, contract.get("supportsDataInput"));
        assertTrue(contract.get("dataFormatRequirements").toString().contains("数据值应为字符串"));
        var response = Map.<String, Object>of("schemaVersion", "component-data-contract/v1", "sourceContract",
                Map.of("sourceType", "static", "branch", "staticData", "structure", Map.of()), "components", List.of(contract));
        assertThrows(AiAgentDataValidation.Violation.class, () -> service.verifyDataContractResult(Map.of("componentIds", List.of("another")), response, 7L));
        var sourceMismatch = new LinkedHashMap<>(response); sourceMismatch.put("sourceContract", Map.of("sourceType", "api", "branch", "apiData", "structure", Map.of()));
        assertThrows(AiAgentDataValidation.Violation.class, () -> service.verifyDataContractResult(Map.of("componentIds", List.of("text"), "sourceType", "static"), sourceMismatch, 7L));
    }
    @Test void patchRequiresExplicitDataContractAndUsesOnlyMatchingComponentAndDocumentVersion() throws Exception {
        var evidence = AiAgentComponentSpecs.completeEvidence(request(List.of("AntdBaseColumn"), "patch"), resolve(List.of("AntdBaseColumn"), "patch"));
        var patch = Map.of("componentId", "chart", "componentType", "AntdBaseColumn", "dataPatch",
                Map.of("sourceType", "static", "staticData", Map.of("value", List.of(Map.of("category", "A", "amount", 2)))),
                "stylePatch", Map.of("style", Map.of("xField", "category", "yField", "amount")));
        var payload = Map.<String, Object>of("patches", List.of(patch));
        assertEquals("agent.operation.component_data_contract_required", assertThrows(AiAgentDataValidation.Violation.class,
                () -> service.validateWrite("patch_canvas_components", payload, evidence, 7L)).validationCode);
        var contract = verifiedContract("AntdBaseColumn", "chart", "static");
        assertEquals(1, service.validateWrite("patch_canvas_components", payload, evidence, List.of(contract), 7L).size());
        var other = new LinkedHashMap<>(contract); other.put("componentId", "another");
        assertThrows(AiAgentDataValidation.Violation.class, () -> service.validateWrite("patch_canvas_components", payload, evidence, List.of(other), 7L));
        var mappingOnly = Map.<String, Object>of("patches", List.of(Map.of("componentId", "chart", "componentType", "AntdBaseColumn", "stylePatch", Map.of("style", Map.of("xField", "missing")))));
        assertThrows(AiAgentDataValidation.Violation.class, () -> service.validateWrite("patch_canvas_components", mappingOnly, evidence, List.of(contract), 7L));
        Files.writeString(file("AntdBaseColumn"), "changed");
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> service.validateWrite("patch_canvas_components", payload, evidence, List.of(contract), 7L));
    }
    @Test void styleOnlyAndLayerOnlyPatchesDoNotRequireADataContract() {
        var evidence = AiAgentComponentSpecs.completeEvidence(request(List.of("BaseText"), "patch"), resolve(List.of("BaseText"), "patch"));
        var payload = Map.<String, Object>of("patches", List.of(Map.of("componentType", "BaseText", "stylePatch", Map.of("style", Map.of("fontSize", 20)))));
        assertEquals(1, service.validateWrite("patch_canvas_components", payload, evidence, 7L).size());
        assertEquals(1, service.validateWrite("patch_canvas_components", payload, List.of(), 7L).size());
        assertTrue(service.validateWrite("patch_canvas_components", Map.of("patches", List.of(Map.of("componentType", "BaseText", "layerPatch", Map.of("x", 20)))), List.of(), 7L).isEmpty());
    }
    @Test void toolCatalogRejectsMissingDataEvidenceBeforeAnyFrontendWrite() {
        var evidence = AiAgentComponentSpecs.completeEvidence(request(List.of("BaseText"), "patch"), resolve(List.of("BaseText"), "patch"));
        var agent = new AiAgentService() {
            @Override List<Map<String, Object>> componentSpecEvidence(AgentExecutionContext context) {return evidence;}
            @Override List<Map<String, Object>> componentDataContractEvidence(AgentExecutionContext context) {return List.of();}
            @Override com.zsq.datavisoolservice.model.po.AiAgentOperationPO findOperation(String id) {return null;}
            @Override public Map<String, Object> latestFrontendReadResult(AgentExecutionContext context) {
                return Map.of("components", List.of(Map.of("id", "text", "type", "BaseText", "data", Map.of("sourceType", "static", "staticData", Map.of("value", "旧标题")))));
            }
        };
        var catalog = new AiAgentToolCatalog(agent, (context, operation, payload, revision) -> {throw new AssertionError("invalid write reached frontend");}, new AiAgentWorkspaceService(root.resolve("data-evidence-workspace")), service);
        var context = new AiAgentService.AgentExecutionContext("thread", "1", "turn", "run", "7", "", Map.of(), Map.of(), Map.of(), null, null, 0);
        var request = dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("patch-call").name("patch_canvas_components")
                .arguments(JSON.toJSONString(Map.of("patches", List.of(Map.of("componentId", "text", "componentType", "BaseText", "dataPatch", Map.of("sourceType", "static", "staticData", Map.of("value", "新标题"))))))).build();
        var result = StagedToolTestSupport.validate(catalog, request.name(), request.arguments(), context);
        assertEquals("repair_required", result.status()); assertEquals("agent.operation.component_data_contract_required", result.result().get("code"));
    }
}
