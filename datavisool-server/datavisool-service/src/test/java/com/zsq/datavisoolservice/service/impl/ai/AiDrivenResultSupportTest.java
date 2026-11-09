/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import org.junit.Assert;
import org.junit.Test;

import java.util.List;
import java.util.Map;

public class AiDrivenResultSupportTest {

    @Test
    public void detectsKnownImageModelCapabilitiesConservatively() {
        Assert.assertTrue(AiModelCapabilitySupport.supportsImageInput("openai", "gpt-5.4"));
        Assert.assertTrue(AiModelCapabilitySupport.supportsImageInput("anthropic", "claude-sonnet-4-6"));
        Assert.assertFalse(AiModelCapabilitySupport.supportsImageInput("deepseek", "deepseek-v4-pro"));
        Assert.assertFalse(AiModelCapabilitySupport.supportsImageInput("compatible", "unknown-model"));
    }

    @Test
    public void buildsMimoRequestWithCompletionTokenField() {
        JSONObject message = new JSONObject();
        message.put("role", "user");
        message.put("content", "hello");
        AiModelProviderRequestSpec spec = AiModelProviderSupport.buildProviderRequest(
                new AiModelProviderRequestContext(
                        "xiaomi-mimo",
                        "mimo-v2.5",
                        null,
                        "secret",
                        1.0D,
                        4096L,
                        List.of(message)
                )
        );

        Assert.assertEquals(
                "https://api.xiaomimimo.com/v1/chat/completions",
                spec.getUrl()
        );
        Assert.assertEquals(4096L, spec.getBody().getLongValue("max_completion_tokens"));
        Assert.assertFalse(spec.getBody().containsKey("max_tokens"));
        Assert.assertEquals("mimo", AiModelProviderSupport.normalizeProviderKeyForStorage("xiaomi"));
        Assert.assertEquals(
                Long.valueOf(117_964L),
                AiModelProviderSupport.boundMaxTokens("mimo", "mimo-v2.5-pro", 200_000L)
        );
        Assert.assertEquals(
                Long.valueOf(57_600L),
                AiModelProviderSupport.boundMaxTokens(
                        "anthropic",
                        "claude-haiku-4-5-20251001",
                        80_000L
                )
        );
        AiModelProviderRequestSpec anthropicSpec = AiModelProviderSupport.buildProviderRequest(
                new AiModelProviderRequestContext(
                        "anthropic",
                        "claude-fable-5",
                        null,
                        "secret",
                        1.0D,
                        null,
                        List.of(message)
                )
        );
        Assert.assertEquals(128_000L, anthropicSpec.getBody().getLongValue("max_tokens"));

        JSONObject anthropicReply = JSON.parseObject("""
                {
                  "content": [
                    {"type": "thinking", "thinking": "internal reasoning"},
                    {"type": "text", "text": "{\\"ok\\":true}"}
                  ]
                }
                """);
        Assert.assertEquals(
                "{\"ok\":true}",
                AiModelProviderSupport.extractReplyText("anthropic", anthropicReply)
        );
        Assert.assertEquals(
                "internal reasoning",
                AiModelProviderSupport.extractReasoningContent("anthropic", anthropicReply)
        );
    }

    @Test
    public void recognizesAndMergesTruncatedModelOutput() {
        JSONObject openAi = JSON.parseObject("""
                {
                  "choices": [{"finish_reason": "length"}],
                  "usage": {"prompt_tokens": 10, "completion_tokens": 20}
                }
                """);
        JSONObject anthropic = JSON.parseObject("""
                {
                  "stop_reason": "max_tokens",
                  "usage": {"input_tokens": 8, "output_tokens": 12}
                }
                """);

        Assert.assertTrue(AiModelContinuationSupport.isLengthFinish("openai", openAi));
        Assert.assertTrue(AiModelContinuationSupport.isLengthFinish("anthropic", anthropic));
        Assert.assertEquals(
                "missing",
                AiModelContinuationSupport.extractFinishReason(
                        "openai",
                        JSON.parseObject("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}")
                )
        );
        Assert.assertEquals(
                "content_filter",
                AiModelContinuationSupport.extractFinishReason(
                        "anthropic",
                        JSON.parseObject("{\"stop_reason\":\"refusal\"}")
                )
        );
        Assert.assertEquals(
                "{\"items\":[1,2]}",
                AiModelContinuationSupport.appendWithOverlap("{\"items\":[1,", "1,2]}")
        );
        Assert.assertEquals(
                "{\"items\":[1,2]}",
                AiModelContinuationSupport.appendWithOverlap(
                        "{\"items\":[1,",
                        "```json\n1,2]}\n```"
                )
        );
        Assert.assertEquals(
                "{\"ok\":true}",
                AiModelContinuationSupport.appendWithOverlap("", "```{\"ok\":true}```")
        );
        Assert.assertEquals(
                "{\"items\":[1,2]}",
                AiModelContinuationSupport.normalizeContinuedJson(
                        "{\"items\":[1,2]} {\"items\":[3,4]}"
                )
        );
        Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelContinuationSupport.normalizeContinuedJson(
                        "{\"items\":[1,2]} trailing"
                )
        );

        JSONObject usage = AiModelContinuationSupport.mergeUsage(
                JSON.parseObject("{\"prompt_tokens\":10,\"completion_tokens\":20}"),
                JSON.parseObject("{\"prompt_tokens\":4,\"completion_tokens\":6}")
        );
        Assert.assertEquals(14, usage.getIntValue("prompt_tokens"));
        Assert.assertEquals(26, usage.getIntValue("completion_tokens"));
    }

    @Test
    public void validatesWorkflowPlanAndComponentReplaceScenes() {
        String workflowPlan = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.fromValue("workflow-plan"),
                """
                        {
                          "summary": "分两步完成",
                          "reason": "先替换再优化",
                          "tasks": [
                            {
                              "id": "task-1",
                              "scene": "component-replace",
                              "goal": "替换图表"
                            },
                            {
                              "id": "task-2",
                              "scene": "style-optimize",
                              "goal": "统一样式",
                              "dependsOn": ["task-1"]
                            }
                          ]
                        }
                        """,
                Map.of(
                        "allowedScenes",
                        List.of(
                                "style-optimize",
                                "data-optimize",
                                "component-generate",
                                "component-replace"
                        ),
                        "maxTasks",
                        12
                )
        );
        Assert.assertEquals(
                "component-replace",
                JSON.parseObject(workflowPlan)
                        .getJSONArray("tasks")
                        .getJSONObject(0)
                        .getString("scene")
        );

        String replacement = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.fromValue("component-replace"),
                """
                        {
                          "summary": "替换为折线图",
                          "reason": "更适合趋势展示",
                          "targetId": "layer-1",
                          "componentType": "antd-line"
                        }
                        """,
                Map.of(
                        "allowedComponentTypes", List.of("antd-line", "antd-bar"),
                        "sourceComponentType", "antd-bar",
                        "targetId", "layer-1"
                )
        );
        Assert.assertEquals("antd-line", JSON.parseObject(replacement).getString("componentType"));

        String route = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.ROUTE_DECISION,
                "{\"scene\":\"component-replace\"}"
        );
        Assert.assertEquals("component-replace", JSON.parseObject(route).getString("scene"));
        Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.ROUTE_DECISION,
                        "{\"scene\":\"component-replace\",}"
                )
        );
    }

    @Test
    public void normalizesReferenceRegionResult() {
        String normalized = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.REFERENCE_REGION_DETECT,
                """
                {
                  "summary": "识别完成",
                  "regions": [
                    {
                      "id": "header",
                      "desc": "标题区",
                      "visualDescription": "顶部标题与时间",
                      "groupEvidence": "位于同一顶部横条",
                      "contains": ["主标题", "时间"],
                      "x": 0,
                      "y": 0,
                      "width": 1920,
                      "height": 120
                    }
                  ]
                }
                """,
                canvasContext()
        );

        JSONObject result = JSON.parseObject(normalized);
        Assert.assertEquals("识别完成", result.getString("summary"));
        Assert.assertEquals("header", result.getJSONArray("regions").getJSONObject(0).getString("id"));
    }

    @Test
    public void referenceRegionCanRequestUserInput() {
        String normalized = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.REFERENCE_REGION_DETECT,
                """
                {"summary":"需要补充","question":"希望保留图中的品牌标识吗？","regions":[]}
                """,
                canvasContext()
        );

        Assert.assertEquals(
                "希望保留图中的品牌标识吗？",
                JSON.parseObject(normalized).getString("question")
        );
    }

    @Test
    public void rejectsLegacyFlatRegionStylePatch() {
        IllegalArgumentException error = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REGION_STYLE_PATCH,
                        """
                        {
                          "patches": [{
                            "componentId": "chart-1",
                            "componentType": "AntdBaseLine",
                            "stylePatch": {"color": "#fff"}
                          }]
                        }
                        """,
                        styleContext()
                )
        );

        Assert.assertTrue(error.getMessage().contains("顶层只能包含非空 style 对象"));
    }

    @Test
    public void acceptsUnifiedRegionStylePatch() {
        String normalized = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.REGION_STYLE_PATCH,
                """
                {
                  "patches": [{
                    "componentId": "chart-1",
                    "componentType": "AntdBaseLine",
                    "stylePatch": {"style": {"color": "#fff"}}
                  }]
                }
                """,
                styleContext()
        );

        JSONObject stylePatch = JSON.parseObject(normalized)
                .getJSONArray("patches")
                .getJSONObject(0)
                .getJSONObject("stylePatch");
        Assert.assertEquals(1, stylePatch.size());
        Assert.assertEquals("#fff", stylePatch.getJSONObject("style").getString("color"));
    }

    @Test
    public void rejectsOverlappingReferenceRegions() {
        IllegalArgumentException error = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REFERENCE_REGION_DETECT,
                        """
                        {
                          "summary": "识别完成",
                          "regions": [
                            {
                              "id": "one",
                              "desc": "区域一",
                              "visualDescription": "内容一",
                              "groupEvidence": "分组一",
                              "contains": ["内容一"],
                              "x": 0, "y": 0, "width": 200, "height": 200
                            },
                            {
                              "id": "two",
                              "desc": "区域二",
                              "visualDescription": "内容二",
                              "groupEvidence": "分组二",
                              "contains": ["内容二"],
                              "x": 100, "y": 100, "width": 200, "height": 200
                            }
                          ]
                        }
                        """,
                        canvasContext()
                )
        );

        Assert.assertTrue(error.getMessage().contains("区域不能重叠"));
    }

    @Test
    public void rejectsUnknownStylePathAndWrongStyleType() {
        IllegalArgumentException pathError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REGION_STYLE_PATCH,
                        """
                        {
                          "patches": [{
                            "componentId": "chart-1",
                            "componentType": "AntdBaseLine",
                            "stylePatch": {"style": {"unknown": "#fff"}}
                          }]
                        }
                        """,
                        styleContext()
                )
        );
        Assert.assertTrue(pathError.getMessage().contains("不在组件协议中"));

        IllegalArgumentException typeError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REGION_STYLE_PATCH,
                        """
                        {
                          "patches": [{
                            "componentId": "chart-1",
                            "componentType": "AntdBaseLine",
                            "stylePatch": {"style": {"color": 123}}
                          }]
                        }
                        """,
                        styleContext()
                )
        );
        Assert.assertTrue(typeError.getMessage().contains("应为 string"));
    }

    @Test
    public void rejectsDynamicOrWrongShapeDataPatch() {
        Map<String, Object> context = Map.of(
                "expectedComponents",
                List.of(Map.of(
                        "componentId", "chart-1",
                        "componentType", "AntdBaseLine",
                        "valueShape", List.of(Map.of("name", "示例", "value", 1))
                ))
        );
        IllegalArgumentException dynamicError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REGION_DATA_PATCH,
                        """
                        {
                          "patches": [{
                            "componentId": "chart-1",
                            "componentType": "AntdBaseLine",
                            "dataPatch": {"sourceType": "api", "value": []}
                          }]
                        }
                        """,
                        context
                )
        );
        Assert.assertTrue(dynamicError.getMessage().contains("必须是 static"));

        IllegalArgumentException shapeError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REGION_DATA_PATCH,
                        """
                        {
                          "patches": [{
                            "componentId": "chart-1",
                            "componentType": "AntdBaseLine",
                            "dataPatch": {
                              "sourceType": "static",
                              "value": [{"name": "示例", "unexpected": 1}]
                            }
                          }]
                        }
                        """,
                        context
                )
        );
        Assert.assertTrue(shapeError.getMessage().contains("不在组件默认数据结构中"));
    }

    @Test
    public void validatesReferenceSelectionCoverageAndLayoutBounds() {
        Map<String, Object> selectionContext = Map.of(
                "allowedComponentTypes", List.of("BaseText", "group"),
                "maxComponents", 4,
                "idPrefix", "region-1-",
                "requiredVisualElements", List.of("标题")
        );
        String selection = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.COMPONENT_SELECT,
                """
                {
                  "summary": "选择完成",
                  "reason": "覆盖标题",
                  "selectedComponents": [{
                    "tempId": "region-1-title",
                    "componentType": "BaseText",
                    "sourceVisualElements": ["标题"],
                    "renderedVisualElement": "标题文本",
                    "visualEvidence": "区域顶部存在标题"
                  }]
                }
                """,
                selectionContext
        );
        Assert.assertEquals(
                "region-1-title",
                JSON.parseObject(selection).getJSONArray("selectedComponents").getJSONObject(0).getString("tempId")
        );

        Map<String, Object> layoutContext = Map.of(
                "region", Map.of("x", 100, "y", 100, "width", 500, "height", 300),
                "expectedComponents", List.of(Map.of(
                        "componentId", "region-1-title",
                        "componentType", "BaseText"
                ))
        );
        IllegalArgumentException layoutError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.COMPONENT_LAYOUT,
                        """
                        {
                          "summary": "布局完成",
                          "reason": "顶部放置",
                          "layers": [{
                            "id": "region-1-title",
                            "name": "标题",
                            "type": "BaseText",
                            "x": 50,
                            "y": 100,
                            "width": 200,
                            "height": 40,
                            "order": 1
                          }]
                        }
                        """,
                        layoutContext
                )
        );
        Assert.assertTrue(layoutError.getMessage().contains("超出当前区域"));
    }

    @Test
    public void validatesComponentAuditCoverage() {
        String normalized = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.REGION_COMPONENT_AUDIT,
                """
                {
                  "summary": "复核通过",
                  "regionId": "region-1",
                  "approved": true,
                  "reviewedComponentIds": ["region-1-title"],
                  "issues": []
                }
                """,
                Map.of(
                        "regionId", "region-1",
                        "componentIds", List.of("region-1-title")
                )
        );
        Assert.assertTrue(JSON.parseObject(normalized).getBooleanValue("approved"));
    }

    @Test
    public void validatesFourStageReferenceRegionProtocol() {
        String partitionReply = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.REFERENCE_CONTENT_PARTITION,
                """
                {
                  "regions": [{
                    "id": "region_01",
                    "name": "设备统计",
                    "type": "content-panel",
                    "contains": ["标题", "图表"],
                    "visualDescription": "带标题的面板内包含图表和图例",
                    "groupingEvidence": ["共享完整容器"]
                  }]
                }
                """
        );
        JSONObject partition = JSON.parseObject(partitionReply);
        Assert.assertEquals("region_01", partition.getJSONArray("regions").getJSONObject(0).getString("id"));

        String localizationReply = AiModelResultSupport.validateAiModelReply(
                AiModelRunScene.REFERENCE_COORDINATE_LOCALIZATION,
                """
                {
                  "regions": [{
                    "regionId": "region_01",
                    "topLeft": {"x": 10, "y": 20},
                    "bottomRight": {"x": 400, "y": 300},
                    "boundaryEvidence": ["根据四边坐标卡尺定位"]
                  }]
                }
                """,
                Map.of(
                        "sourceImage", Map.of("width", 1920, "height", 1080),
                        "expectedRegions", List.of(Map.of("id", "region_01"))
                )
        );
        Assert.assertEquals(
                400,
                JSON.parseObject(localizationReply)
                        .getJSONArray("regions")
                        .getJSONObject(0)
                        .getJSONObject("bottomRight")
                        .getIntValue("x")
        );
    }

    @Test
    public void rejectsCoordinatesDuringContentPartitionAndOverlappingOutlineMove() {
        IllegalArgumentException partitionError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REFERENCE_CONTENT_PARTITION,
                        """
                        {
                          "regions": [{
                            "id": "region_01",
                            "name": "区域",
                            "type": "other",
                            "contains": ["内容"],
                            "visualDescription": "内容区域",
                            "groupingEvidence": ["完整容器"],
                            "x": 10
                          }]
                        }
                        """
                )
        );
        Assert.assertTrue(partitionError.getMessage().contains("禁止输出坐标"));

        Map<String, Object> outlineContext = Map.of(
                "sourceImage", Map.of("width", 400, "height", 300),
                "expectedRegions", List.of(
                        Map.of("id", "region_01", "bounds", Map.of(
                                "left", 0, "top", 0, "right", 180, "bottom", 300
                        )),
                        Map.of("id", "region_02", "bounds", Map.of(
                                "left", 220, "top", 0, "right", 400, "bottom", 300
                        ))
                )
        );
        IllegalArgumentException outlineError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REFERENCE_OUTLINE_REFINEMENT,
                        """
                        {
                          "regions": [
                            {
                              "regionId": "region_01",
                              "left": {"action":"keep","suggested":null,"reason":"贴合"},
                              "top": {"action":"keep","suggested":null,"reason":"贴合"},
                              "right": {"action":"move","suggested":250,"reason":"向右"},
                              "bottom": {"action":"keep","suggested":null,"reason":"贴合"}
                            },
                            {
                              "regionId": "region_02",
                              "left": {"action":"keep","suggested":null,"reason":"贴合"},
                              "top": {"action":"keep","suggested":null,"reason":"贴合"},
                              "right": {"action":"keep","suggested":null,"reason":"贴合"},
                              "bottom": {"action":"keep","suggested":null,"reason":"贴合"}
                            }
                          ]
                        }
                        """,
                        outlineContext
                )
        );
        Assert.assertTrue(outlineError.getMessage().contains("不能重叠"));
    }

    @Test
    public void enforcesGenericTaskTargetProtocols() {
        Map<String, Object> styleContext = Map.of(
                "expectedComponent",
                Map.of(
                        "componentId", "text-1",
                        "componentType", "BaseText",
                        "allowedStylePaths", List.of("fontSize"),
                        "allowedStyleRules", List.of(
                                Map.of("path", "fontSize", "type", "number", "min", 1, "max", 200)
                        )
                )
        );
        IllegalArgumentException styleError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.STYLE_OPTIMIZE,
                        """
                        {
                          "summary": "调整字号",
                          "reason": "增强可读性",
                          "stylePatch": {"fontSize": 240}
                        }
                        """,
                        styleContext
                )
        );
        Assert.assertTrue(styleError.getMessage().contains("超出组件协议范围"));

        Map<String, Object> dataContext = Map.of(
                "expectedComponent",
                Map.of(
                        "componentId", "chart-1",
                        "componentType", "AntdBaseBar"
                ),
                "allowedSourceTypes",
                List.of("static", "api")
        );
        IllegalArgumentException dataError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.DATA_OPTIMIZE,
                        """
                        {
                          "summary": "接入接口",
                          "reason": "读取实时数据",
                          "sourceType": "api",
                          "dataPatch": {"base": {"id": "other"}}
                        }
                        """,
                        dataContext
                )
        );
        Assert.assertTrue(dataError.getMessage().contains("dataPatch 包含禁止字段"));
    }

    @Test
    public void enforcesDocumentStyleRangesAndRuntimeDataRequiredFields() {
        Map<String, Object> styleContext = Map.of(
                "expectedComponents",
                List.of(Map.of(
                        "componentId", "text-1",
                        "componentType", "BaseText",
                        "allowedStylePaths", List.of("fontSize", "textAlign"),
                        "allowedStyleRules", List.of(
                                Map.of("path", "fontSize", "type", "number", "min", 1, "max", 200),
                                Map.of("path", "textAlign", "type", "string", "enumValues", List.of("left", "center", "right"))
                        )
                ))
        );
        IllegalArgumentException rangeError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REGION_STYLE_PATCH,
                        """
                        {
                          "patches": [{
                            "componentId": "text-1",
                            "componentType": "BaseText",
                            "stylePatch": {"style": {"fontSize": 240}}
                          }]
                        }
                        """,
                        styleContext
                )
        );
        Assert.assertTrue(rangeError.getMessage().contains("超出组件协议范围"));

        Map<String, Object> dataContext = Map.of(
                "expectedComponents",
                List.of(Map.of(
                        "componentId", "chart-1",
                        "componentType", "AntdBaseLine",
                        "valueSchema", Map.of(
                                "type", "array",
                                "minItems", 1,
                                "maxItems", 200,
                                "itemSchema", Map.of(
                                        "type", "object",
                                        "allowAdditionalFields", false,
                                        "fields", List.of(
                                                Map.of("name", "name", "required", true, "schema", Map.of("type", "string")),
                                                Map.of("name", "value", "required", true, "schema", Map.of("type", "number"))
                                        )
                                )
                        )
                ))
        );
        IllegalArgumentException dataError = Assert.assertThrows(
                IllegalArgumentException.class,
                () -> AiModelResultSupport.validateAiModelReply(
                        AiModelRunScene.REGION_DATA_PATCH,
                        """
                        {
                          "patches": [{
                            "componentId": "chart-1",
                            "componentType": "AntdBaseLine",
                            "dataPatch": {
                              "sourceType": "static",
                              "value": [{"name": "一月"}]
                            }
                          }]
                        }
                        """,
                        dataContext
                )
        );
        Assert.assertTrue(dataError.getMessage().contains("缺少必填字段"));
    }

    private static Map<String, Object> canvasContext() {
        return Map.of("canvas", Map.of("width", 1920, "height", 1080));
    }

    private static Map<String, Object> styleContext() {
        return Map.of(
                "expectedComponents",
                List.of(Map.of(
                        "componentId", "chart-1",
                        "componentType", "AntdBaseLine",
                        "allowedStylePaths", List.of("color"),
                        "allowedStyleRules", List.of(Map.of("path", "color", "type", "string"))
                ))
        );
    }
}
