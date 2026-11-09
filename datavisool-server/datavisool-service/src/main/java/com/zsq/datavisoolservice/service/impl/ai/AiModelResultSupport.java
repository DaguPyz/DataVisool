/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.alibaba.fastjson2.JSONWriter;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AiModelResultSupport {
    private static final ObjectMapper STRICT_JSON_MAPPER = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private AiModelResultSupport() {
    }

    public static String validateAiModelReply(AiModelRunScene scene, String reply) {
        return validateAiModelReply(scene, reply, null);
    }

    public static String validateAiModelReply(
            AiModelRunScene scene,
            String reply,
            Map<String, Object> validationContext
    ) {
        String trimmed = reply == null ? "" : reply.trim();
        if (scene == null) {
            return trimmed;
        }
        JSONObject context = validationContext == null
                ? null
                : JSON.parseObject(JSON.toJSONString(validationContext));

        return switch (scene) {
            case STYLE_OPTIMIZE -> validateStyleOptimizeReply(trimmed, scene, context);
            case DATA_OPTIMIZE -> validateDataOptimizeReply(trimmed, scene, context);
            case ROUTE_DECISION -> validateRouteDecisionReply(trimmed, scene);
            case WORKFLOW_PLAN -> validateWorkflowPlanReply(trimmed, scene, context);
            case COMPONENT_SELECT -> validateComponentSelectReply(trimmed, scene, context);
            case COMPONENT_LAYOUT -> validateComponentLayoutReply(trimmed, scene, context);
            case COMPONENT_GENERATE -> validateComponentGenerateReply(trimmed, scene, context);
            case COMPONENT_REPLACE -> validateComponentReplaceReply(trimmed, scene, context);
            case REFERENCE_CONTENT_PARTITION ->
                    validateReferenceContentPartitionReply(trimmed, scene);
            case REFERENCE_COORDINATE_LOCALIZATION ->
                    validateReferenceCoordinateLocalizationReply(trimmed, scene, context);
            case REFERENCE_OUTLINE_REFINEMENT ->
                    validateReferenceOutlineRefinementReply(trimmed, scene, context);
            case REFERENCE_REGION_DETECT, REFERENCE_BOUNDARY_REVIEW ->
                    validateReferenceRegionsReply(trimmed, scene, context);
            case REGION_COMPONENT_AUDIT -> validateRegionComponentAuditReply(trimmed, scene, context);
            case REGION_STYLE_PATCH -> validateRegionStylePatchReply(trimmed, scene, context);
            case REGION_DATA_PATCH -> validateRegionDataPatchReply(trimmed, scene, context);
        };
    }

    public static String buildAiModelRepairPrompt(AiModelRunScene scene, String errorMessage) {
        String sanitizedError = sanitizeErrorMessage(errorMessage);
        return """
                你上一条关于“%s”场景的回复未通过系统校验。
                错误信息如下：
                %s

                请基于上一条回复直接修复，并重新回答。
                严格要求：
                1. 只输出一个纯 JSON 对象。
                2. 不要输出 Markdown 代码块、注释、解释性文字或任何前后缀。
                3. 保持原有语义，只修复结构、类型、字段或 JSON 格式问题。
                4. 输出结果必须可以被 JSON.parse 直接解析。
                """.formatted(scene.getDisplayName(), sanitizedError).trim();
    }

    public static String sanitizeErrorMessage(String msg) {
        if (msg == null) {
            return "";
        }
        return msg.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ').trim();
    }

    private static String validateStyleOptimizeReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject normalizedSingle = null;
        String singleError = null;
        try {
            normalizedSingle = tryNormalizeStyleOptimizeSingle(payload, scene);
        } catch (IllegalArgumentException e) {
            singleError = e.getMessage();
        }
        if (normalizedSingle != null) {
            validateStyleOptimizeAgainstContext(normalizedSingle, validationContext, scene);
            return prettyPrint(normalizedSingle);
        }

        try {
            JSONObject normalizedBatch = tryNormalizeStyleOptimizeBatch(payload, scene);
            if (normalizedBatch != null) {
                validateStyleOptimizeAgainstContext(normalizedBatch, validationContext, scene);
                return prettyPrint(normalizedBatch);
            }
        } catch (IllegalArgumentException e) {
            String batchError = e.getMessage();
            if (singleError == null) {
                singleError = "样式优化结果校验失败";
            }
            throw new IllegalArgumentException(singleError + "；或者多组件样式优化结果反序列化失败：" + batchError);
        }

        throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：必须包含 stylePatch 或 componentPatches");
    }

    private static String validateReferenceContentPartitionReply(
            String reply,
            AiModelRunScene scene
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        JSONArray regions = data.getJSONArray("regions");
        String question = trimToNull(data.getString("question"));
        if ((regions == null || regions.isEmpty()) && question == null) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：regions 不能为空，或返回 question 请求用户补充信息"
            );
        }
        if (regions != null && regions.size() > 24) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：regions 不能超过 24 个"
            );
        }

        Set<String> allowedTypes = Set.of(
                "header",
                "content-panel",
                "kpi-card",
                "chart-panel",
                "table-panel",
                "main-visual",
                "status-panel",
                "other"
        );
        Set<String> regionIds = new HashSet<>();
        JSONArray normalizedRegions = new JSONArray();
        if (regions != null) {
            for (int index = 0; index < regions.size(); index++) {
                JSONObject region = regions.getJSONObject(index);
                if (region == null) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：regions[" + index + "] 必须是对象"
                    );
                }
                requireOnlyKeys(
                        region,
                        Set.of("id", "name", "type", "contains", "visualDescription", "groupingEvidence"),
                        scene.getDisplayName() + "场景结果校验失败：内容分区禁止输出坐标或额外字段"
                );
                String id = requireString(
                        region,
                        "id",
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].id 不能为空"
                );
                String expectedId = "region_%02d".formatted(index + 1);
                if (!expectedId.equals(id)) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：区域 id 必须连续编号，期望 " + expectedId
                    );
                }
                if (!regionIds.add(id)) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：区域 id 不能重复：" + id
                    );
                }
                String name = requireString(
                        region,
                        "name",
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].name 不能为空"
                );
                String type = requireString(
                        region,
                        "type",
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].type 不能为空"
                );
                if (!allowedTypes.contains(type)) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].type 不合法"
                    );
                }
                String visualDescription = requireString(
                        region,
                        "visualDescription",
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].visualDescription 不能为空"
                );
                JSONArray contains = requireNonEmptyStringArray(region, "contains", scene, index);
                JSONArray groupingEvidence = requireNonEmptyStringArray(
                        region,
                        "groupingEvidence",
                        scene,
                        index
                );
                JSONObject normalized = new JSONObject();
                normalized.put("id", id);
                normalized.put("name", name);
                normalized.put("type", type);
                normalized.put("contains", contains);
                normalized.put("visualDescription", visualDescription);
                normalized.put("groupingEvidence", groupingEvidence);
                normalizedRegions.add(normalized);
            }
        }

        JSONObject normalized = new JSONObject();
        normalized.put("regions", normalizedRegions);
        if (question != null) {
            normalized.put("question", question);
        }
        return prettyPrint(normalized);
    }

    private static String validateReferenceCoordinateLocalizationReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        JSONArray regions = data.getJSONArray("regions");
        JSONArray expectedRegions = validationContext == null
                ? null
                : validationContext.getJSONArray("expectedRegions");
        double[] sourceSize = requireValidationSourceImage(validationContext, scene);
        if (regions == null || expectedRegions == null || regions.size() != expectedRegions.size()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：坐标定位必须按原顺序覆盖全部区域"
            );
        }
        JSONArray normalizedRegions = new JSONArray();
        for (int index = 0; index < regions.size(); index++) {
            JSONObject region = regions.getJSONObject(index);
            JSONObject expected = expectedRegions.getJSONObject(index);
            if (region == null || expected == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "] 必须是对象"
                );
            }
            requireOnlyKeys(
                    region,
                    Set.of("regionId", "topLeft", "bottomRight", "boundaryEvidence"),
                    scene.getDisplayName() + "场景结果校验失败：坐标定位包含额外字段"
            );
            String regionId = requireString(
                    region,
                    "regionId",
                    scene.getDisplayName() + "场景结果校验失败：regionId 不能为空"
            );
            if (!regionId.equals(expected.getString("id"))) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：坐标定位不得改变区域 id 或顺序"
                );
            }
            JSONObject topLeft = requirePoint(region, "topLeft", index, scene);
            JSONObject bottomRight = requirePoint(region, "bottomRight", index, scene);
            double left = topLeft.getDoubleValue("x");
            double top = topLeft.getDoubleValue("y");
            double right = bottomRight.getDoubleValue("x");
            double bottom = bottomRight.getDoubleValue("y");
            if (left < 0
                    || top < 0
                    || right > sourceSize[0]
                    || bottom > sourceSize[1]
                    || right <= left
                    || bottom <= top) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "] 像素边界无效或越界"
                );
            }
            JSONArray evidence = requireNonEmptyStringArray(region, "boundaryEvidence", scene, index);
            JSONObject normalized = new JSONObject();
            normalized.put("regionId", regionId);
            normalized.put("topLeft", topLeft);
            normalized.put("bottomRight", bottomRight);
            normalized.put("boundaryEvidence", evidence);
            normalizedRegions.add(normalized);
        }
        validateLocalizedRegionOverlap(normalizedRegions, scene);
        JSONObject normalized = new JSONObject();
        normalized.put("regions", normalizedRegions);
        return prettyPrint(normalized);
    }

    private static String validateReferenceOutlineRefinementReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        JSONArray regions = data.getJSONArray("regions");
        JSONArray expectedRegions = validationContext == null
                ? null
                : validationContext.getJSONArray("expectedRegions");
        double[] sourceSize = requireValidationSourceImage(validationContext, scene);
        if (regions == null || expectedRegions == null || regions.size() != expectedRegions.size()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：线框微调必须按原顺序覆盖全部区域"
            );
        }
        JSONArray normalizedRegions = new JSONArray();
        for (int index = 0; index < regions.size(); index++) {
            JSONObject region = regions.getJSONObject(index);
            JSONObject expected = expectedRegions.getJSONObject(index);
            if (region == null || expected == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "] 必须是对象"
                );
            }
            requireOnlyKeys(
                    region,
                    Set.of("regionId", "left", "top", "right", "bottom"),
                    scene.getDisplayName() + "场景结果校验失败：线框微调包含额外字段"
            );
            String regionId = requireString(
                    region,
                    "regionId",
                    scene.getDisplayName() + "场景结果校验失败：regionId 不能为空"
            );
            if (!regionId.equals(expected.getString("id"))) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：线框微调不得改变区域 id 或顺序"
                );
            }
            JSONObject normalized = new JSONObject();
            normalized.put("regionId", regionId);
            normalized.put("left", validateEdgeReview(region, "left", sourceSize[0], index, scene));
            normalized.put("top", validateEdgeReview(region, "top", sourceSize[1], index, scene));
            normalized.put("right", validateEdgeReview(region, "right", sourceSize[0], index, scene));
            normalized.put("bottom", validateEdgeReview(region, "bottom", sourceSize[1], index, scene));
            normalizedRegions.add(normalized);
        }
        validateOutlineGeometry(normalizedRegions, expectedRegions, sourceSize, scene);
        JSONObject normalized = new JSONObject();
        normalized.put("regions", normalizedRegions);
        return prettyPrint(normalized);
    }

    private static String validateReferenceRegionsReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        String summary = trimToNull(firstString(data, "summary", "description"));
        String question = trimToNull(firstString(data, "question", "userQuestion", "needMoreInfo"));
        JSONArray regions = firstArray(data, "regions", "items", "areas");
        if ((regions == null || regions.isEmpty()) && question == null) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：regions 不能为空，或返回 question 请求用户补充信息");
        }

        JSONArray normalizedRegions = new JSONArray();
        double[] canvasSize = requireValidationCanvas(validationContext, scene);
        Set<String> regionIds = new HashSet<>();
        if (regions != null) {
            if (regions.size() > 12) {
                throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：regions 不能超过 12 个");
            }
            for (int index = 0; index < regions.size(); index++) {
                Object value = regions.get(index);
                if (!(value instanceof JSONObject region)) {
                    throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：regions[" + index + "] 必须是对象");
                }
                String id = requireString(
                        region,
                        new String[]{"id", "regionId", "key"},
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].id 不能为空"
                );
                String desc = requireString(
                        region,
                        new String[]{"desc", "description", "role"},
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].desc 不能为空"
                );
                String visualDescription = requireString(
                        region,
                        new String[]{"visualDescription", "visual_description", "visual"},
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].visualDescription 不能为空"
                );
                String groupEvidence = requireString(
                        region,
                        new String[]{"groupEvidence", "group_evidence", "evidence"},
                        scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].groupEvidence 不能为空"
                );
                JSONArray contains = firstArray(region, "contains", "visualElements", "elements");
                if (contains == null || contains.isEmpty()) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].contains 不能为空"
                    );
                }
                JSONArray normalizedContains = new JSONArray();
                Set<String> seenElements = new HashSet<>();
                for (Object element : contains) {
                    if (!(element instanceof String text) || trimToNull(text) == null) {
                        throw new IllegalArgumentException(
                                scene.getDisplayName() + "场景结果校验失败：regions[" + index + "].contains 只能包含非空字符串"
                        );
                    }
                    if (seenElements.add(text.trim())) {
                        normalizedContains.add(text.trim());
                    }
                }
                double x = requireFiniteNumber(region, index, scene, "x", "left");
                double y = requireFiniteNumber(region, index, scene, "y", "top");
                double width = requirePositiveNumber(region, index, scene, "width", "w");
                double height = requirePositiveNumber(region, index, scene, "height", "h");
                if (x < 0 || y < 0) {
                    throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：区域坐标不能小于 0");
                }
                if (!regionIds.add(id)) {
                    throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：区域 id 不能重复：" + id);
                }
                if (x + width > canvasSize[0] || y + height > canvasSize[1]) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：regions[" + index + "] 超出目标画布边界"
                    );
                }

                JSONObject normalized = new JSONObject();
                normalized.put("id", id);
                normalized.put("desc", desc);
                normalized.put("x", x);
                normalized.put("y", y);
                normalized.put("width", width);
                normalized.put("height", height);
                normalized.put("visualDescription", visualDescription);
                normalized.put("groupEvidence", groupEvidence);
                normalized.put("contains", normalizedContains);
                normalizedRegions.add(normalized);
            }
        }
        validateRegionOverlap(normalizedRegions, scene);

        JSONObject normalized = new JSONObject();
        normalized.put("summary", summary == null ? scene.getDisplayName() + "完成" : summary);
        normalized.put("regions", normalizedRegions);
        if (question != null) {
            normalized.put("question", question);
        }
        return prettyPrint(normalized);
    }

    private static String validateRegionStylePatchReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        JSONArray patches = firstArray(data, "patches", "componentPatches", "items");
        if (patches == null || patches.isEmpty()) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：patches 不能为空");
        }
        Map<String, JSONObject> expectedComponents = requireExpectedComponents(validationContext, scene);
        if (patches.size() != expectedComponents.size()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：必须为全部 "
                            + expectedComponents.size() + " 个组件生成且仅生成一个样式补丁"
            );
        }

        JSONArray normalizedPatches = new JSONArray();
        Set<String> actualComponentIds = new HashSet<>();
        for (int index = 0; index < patches.size(); index++) {
            Object value = patches.get(index);
            if (!(value instanceof JSONObject patch)) {
                throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：patches[" + index + "] 必须是对象");
            }
            String componentId = requireString(
                    patch,
                    new String[]{"componentId", "targetId", "id"},
                    scene.getDisplayName() + "场景结果校验失败：patches[" + index + "].componentId 不能为空"
            );
            String componentType = requireString(
                    patch,
                    new String[]{"componentType", "type"},
                    scene.getDisplayName() + "场景结果校验失败：patches[" + index + "].componentType 不能为空"
            );
            JSONObject expected = expectedComponents.get(componentId);
            if (expected == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：patches[" + index + "] 包含未知 componentId：" + componentId
                );
            }
            if (!actualComponentIds.add(componentId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：patches[" + index + "] 的 componentId 重复：" + componentId
                );
            }
            String expectedType = requireString(
                    expected,
                    "componentType",
                    scene.getDisplayName() + "场景 validationContext 中 componentType 不能为空"
            );
            if (!expectedType.equals(componentType)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：componentType 与目标组件不一致：" + componentId
                );
            }
            JSONObject stylePatch = firstObject(patch, "stylePatch");
            if (stylePatch == null
                    || stylePatch.size() != 1
                    || !stylePatch.containsKey("style")
                    || !(stylePatch.get("style") instanceof JSONObject style)
                    || style.isEmpty()) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：patches[" + index + "].stylePatch 顶层只能包含非空 style 对象"
                );
            }
            validateStylePaths(style, expected, scene, index);
            JSONObject normalized = new JSONObject();
            normalized.put("componentId", componentId);
            normalized.put("componentType", componentType);
            normalized.put("stylePatch", stylePatch);
            copyOptionalString(patch, normalized, "reason");
            normalizedPatches.add(normalized);
        }
        if (!actualComponentIds.containsAll(expectedComponents.keySet())) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：样式补丁未覆盖全部目标组件");
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", trimToNull(firstString(data, "summary")) == null
                ? "区域样式补丁生成完成"
                : trimToNull(firstString(data, "summary")));
        normalized.put("patches", normalizedPatches);
        return prettyPrint(normalized);
    }

    private static String validateRegionComponentAuditReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        String regionId = requireString(
                data,
                "regionId",
                scene.getDisplayName() + "场景结果校验失败：regionId 不能为空"
        );
        String expectedRegionId = validationContext == null
                ? null
                : trimToNull(validationContext.getString("regionId"));
        if (expectedRegionId == null || !expectedRegionId.equals(regionId)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：regionId 与当前区域不一致"
            );
        }
        Object approvedValue = data.get("approved");
        if (!(approvedValue instanceof Boolean approved)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：approved 必须是 boolean"
            );
        }
        Set<String> expectedComponentIds = requireStringSet(validationContext, "componentIds", scene);
        JSONArray reviewedIdsValue = data.getJSONArray("reviewedComponentIds");
        if (reviewedIdsValue == null) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：reviewedComponentIds 不能为空"
            );
        }
        Set<String> reviewedIds = new HashSet<>();
        for (Object value : reviewedIdsValue) {
            if (!(value instanceof String id) || trimToNull(id) == null || !reviewedIds.add(id.trim())) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：reviewedComponentIds 必须唯一且非空"
                );
            }
        }
        if (!reviewedIds.equals(expectedComponentIds)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：视觉复核必须覆盖全部候选组件"
            );
        }
        JSONArray issuesValue = data.getJSONArray("issues");
        JSONArray issues = new JSONArray();
        if (issuesValue != null) {
            for (Object value : issuesValue) {
                if (!(value instanceof String issue) || trimToNull(issue) == null) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：issues 只能包含非空字符串"
                    );
                }
                issues.add(issue.trim());
            }
        }
        String question = trimToNull(data.getString("question"));
        if (!approved && issues.isEmpty() && question == null) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：未通过时必须提供 issues 或 question"
            );
        }
        if (approved && !issues.isEmpty()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：通过时 issues 必须为空"
            );
        }
        JSONObject normalized = new JSONObject();
        normalized.put("regionId", regionId);
        normalized.put("approved", approved);
        normalized.put("reviewedComponentIds", reviewedIdsValue);
        normalized.put("issues", issues);
        String summary = trimToNull(data.getString("summary"));
        normalized.put("summary", summary == null ? "区域组件视觉复核完成" : summary);
        if (question != null) {
            normalized.put("question", question);
        }
        return prettyPrint(normalized);
    }

    private static String validateRegionDataPatchReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        JSONArray patches = firstArray(data, "patches", "componentPatches", "items");
        if (patches == null || patches.isEmpty()) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：patches 不能为空");
        }
        Map<String, JSONObject> expectedComponents = requireExpectedComponents(validationContext, scene);
        if (patches.size() != expectedComponents.size()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：必须为全部 "
                            + expectedComponents.size() + " 个数据型组件生成且仅生成一个数据补丁"
            );
        }

        JSONArray normalizedPatches = new JSONArray();
        Set<String> actualComponentIds = new HashSet<>();
        for (int index = 0; index < patches.size(); index++) {
            Object value = patches.get(index);
            if (!(value instanceof JSONObject patch)) {
                throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：patches[" + index + "] 必须是对象");
            }
            String componentId = requireString(
                    patch,
                    new String[]{"componentId", "targetId", "id"},
                    scene.getDisplayName() + "场景结果校验失败：patches[" + index + "].componentId 不能为空"
            );
            String componentType = requireString(
                    patch,
                    new String[]{"componentType", "type"},
                    scene.getDisplayName() + "场景结果校验失败：patches[" + index + "].componentType 不能为空"
            );
            JSONObject expected = expectedComponents.get(componentId);
            if (expected == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：patches[" + index + "] 包含未知 componentId：" + componentId
                );
            }
            if (!actualComponentIds.add(componentId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：patches[" + index + "] 的 componentId 重复：" + componentId
                );
            }
            String expectedType = requireString(
                    expected,
                    "componentType",
                    scene.getDisplayName() + "场景 validationContext 中 componentType 不能为空"
            );
            if (!expectedType.equals(componentType)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：componentType 与目标组件不一致：" + componentId
                );
            }
            JSONObject dataPatch = firstObject(patch, "dataPatch", "data");
            if (dataPatch == null || dataPatch.isEmpty()) {
                throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：patches[" + index + "].dataPatch 必须是非空对象");
            }
            validateStaticDataPatch(dataPatch, expected, scene, index);
            JSONObject normalized = new JSONObject();
            normalized.put("componentId", componentId);
            normalized.put("componentType", componentType);
            normalized.put("dataPatch", dataPatch);
            copyOptionalString(patch, normalized, "reason");
            normalizedPatches.add(normalized);
        }
        if (!actualComponentIds.containsAll(expectedComponents.keySet())) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：数据补丁未覆盖全部目标组件");
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", trimToNull(firstString(data, "summary")) == null
                ? "区域数据补丁生成完成"
                : trimToNull(firstString(data, "summary")));
        normalized.put("patches", normalizedPatches);
        return prettyPrint(normalized);
    }

    private static JSONObject tryNormalizeStyleOptimizeSingle(JSONObject payload, AiModelRunScene scene) {
        JSONObject data = resolvePayload(payload);
        String summary = requireString(data, "summary", scene.getDisplayName() + "场景结果校验失败：summary 不能为空");
        String reason = requireString(data, "reason", scene.getDisplayName() + "场景结果校验失败：reason 不能为空");
        JSONObject stylePatch = firstObject(data, "stylePatch", "style_patch", "style", "patch");
        if (stylePatch == null) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：stylePatch 必须是对象");
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", summary);
        normalized.put("reason", reason);
        normalized.put("stylePatch", stylePatch);
        return normalized;
    }

    private static JSONObject tryNormalizeStyleOptimizeBatch(JSONObject payload, AiModelRunScene scene) {
        JSONObject data = resolvePayload(payload);
        String summary = requireString(data, "summary", scene.getDisplayName() + "场景结果校验失败：summary 不能为空");
        String reason = requireString(data, "reason", scene.getDisplayName() + "场景结果校验失败：reason 不能为空");
        JSONArray componentPatchesValue = firstArray(data, "componentPatches", "patches", "results");
        if (componentPatchesValue == null || componentPatchesValue.isEmpty()) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：componentPatches 不能为空");
        }

        JSONArray normalizedPatches = new JSONArray();
        for (int index = 0; index < componentPatchesValue.size(); index++) {
            Object itemValue = componentPatchesValue.get(index);
            if (!(itemValue instanceof JSONObject item)) {
                throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：componentPatches[" + index + "] 必须是对象");
            }

            String targetId = requireString(
                    item,
                    new String[]{"targetId", "target_id", "id", "tempId"},
                    scene.getDisplayName() + "场景结果校验失败：componentPatches[" + index + "].targetId 不能为空"
            );
            JSONObject stylePatch = firstObject(item, "stylePatch", "style_patch", "style", "patch");
            if (stylePatch == null) {
                throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：componentPatches[" + index + "].stylePatch 必须是对象");
            }

            JSONObject normalizedItem = new JSONObject();
            normalizedItem.put("targetId", targetId);
            copyOptionalString(item, normalizedItem, "componentName", "component_name", "name");
            copyOptionalString(item, normalizedItem, "componentType", "component_type", "componentKey", "type");
            copyOptionalString(item, normalizedItem, "summary");
            copyOptionalString(item, normalizedItem, "reason");
            normalizedItem.put("stylePatch", stylePatch);

            JSONArray changedFields = firstArray(item, "changedFields", "changed_fields");
            if (changedFields != null && !changedFields.isEmpty()) {
                JSONArray normalizedChangedFields = new JSONArray();
                for (Object field : changedFields) {
                    if (field instanceof String string && !string.trim().isEmpty()) {
                        normalizedChangedFields.add(string.trim());
                    }
                }
                if (!normalizedChangedFields.isEmpty()) {
                    normalizedItem.put("changedFields", normalizedChangedFields);
                }
            }

            normalizedPatches.add(normalizedItem);
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", summary);
        normalized.put("reason", reason);
        normalized.put("componentPatches", normalizedPatches);
        return normalized;
    }

    private static String validateDataOptimizeReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        String summary = requireString(data, "summary", scene.getDisplayName() + "场景结果校验失败：summary 不能为空");
        String reason = requireString(data, "reason", scene.getDisplayName() + "场景结果校验失败：reason 不能为空");
        JSONObject dataPatch = firstObject(data, "dataPatch", "data", "patch");
        if (dataPatch == null || dataPatch.isEmpty()) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：dataPatch 不能为空");
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", summary);
        normalized.put("reason", reason);

        String sourceType = trimToNull(firstString(data, "sourceType", "source_type"));
        if (sourceType != null) {
            normalized.put("sourceType", sourceType);
        }
        copyOptionalString(data, normalized, "targetId", "target_id", "id");
        copyOptionalString(data, normalized, "componentType", "component_type", "componentKey", "type");
        normalized.put("dataPatch", dataPatch);

        JSONArray componentPatchesValue = firstArray(data, "componentPatches", "patches", "results");
        if (componentPatchesValue != null && !componentPatchesValue.isEmpty()) {
            JSONArray normalizedPatches = new JSONArray();
            for (Object itemValue : componentPatchesValue) {
                if (!(itemValue instanceof JSONObject item)) {
                    continue;
                }
                JSONObject patch = firstObject(item, "dataPatch", "data", "patch");
                if (patch == null || patch.isEmpty()) {
                    continue;
                }
                JSONObject normalizedItem = new JSONObject();
                copyOptionalString(item, normalizedItem, "targetId", "target_id", "id", "tempId");
                copyOptionalString(item, normalizedItem, "componentName", "component_name", "name");
                copyOptionalString(item, normalizedItem, "componentType", "component_type", "componentKey", "type");
                copyOptionalString(item, normalizedItem, "summary");
                copyOptionalString(item, normalizedItem, "reason");
                String itemSourceType = trimToNull(firstString(item, "sourceType", "source_type"));
                if (itemSourceType != null) {
                    normalizedItem.put("sourceType", itemSourceType);
                }
                normalizedItem.put("dataPatch", patch);
                normalizedPatches.add(normalizedItem);
            }
            if (!normalizedPatches.isEmpty()) {
                normalized.put("componentPatches", normalizedPatches);
            }
        }

        validateDataOptimizeAgainstContext(normalized, validationContext, scene);
        return prettyPrint(normalized);
    }

    private static void validateStyleOptimizeAgainstContext(
            JSONObject normalized,
            JSONObject context,
            AiModelRunScene scene
    ) {
        JSONObject expected = context == null ? null : context.getJSONObject("expectedComponent");
        if (expected == null) {
            return;
        }
        String expectedId = requireString(
                expected,
                "componentId",
                scene.getDisplayName() + "场景 validationContext.expectedComponent.componentId 不能为空"
        );
        String expectedType = requireString(
                expected,
                "componentType",
                scene.getDisplayName() + "场景 validationContext.expectedComponent.componentType 不能为空"
        );
        JSONArray patches = normalized.getJSONArray("componentPatches");
        if (patches == null) {
            JSONObject stylePatch = normalized.getJSONObject("stylePatch");
            validateStylePaths(stylePatch, expected, scene, 0);
            return;
        }
        if (patches.size() != 1) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：当前请求只能返回一个组件样式补丁"
            );
        }
        JSONObject patch = patches.getJSONObject(0);
        String targetId = patch == null ? null : trimToNull(patch.getString("targetId"));
        if (!expectedId.equals(targetId)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：targetId 与当前组件不一致"
            );
        }
        String componentType = trimToNull(patch.getString("componentType"));
        if (componentType != null && !expectedType.equals(componentType)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：componentType 与当前组件不一致"
            );
        }
        validateStylePaths(patch.getJSONObject("stylePatch"), expected, scene, 0);
    }

    private static void validateDataOptimizeAgainstContext(
            JSONObject normalized,
            JSONObject context,
            AiModelRunScene scene
    ) {
        JSONObject expected = context == null ? null : context.getJSONObject("expectedComponent");
        if (expected == null) {
            return;
        }
        String expectedId = requireString(
                expected,
                "componentId",
                scene.getDisplayName() + "场景 validationContext.expectedComponent.componentId 不能为空"
        );
        String expectedType = requireString(
                expected,
                "componentType",
                scene.getDisplayName() + "场景 validationContext.expectedComponent.componentType 不能为空"
        );
        Set<String> allowedSourceTypes = requireStringSet(context, "allowedSourceTypes", scene);
        JSONArray patches = normalized.getJSONArray("componentPatches");
        if (patches == null) {
            String targetId = trimToNull(normalized.getString("targetId"));
            if (targetId != null && !expectedId.equals(targetId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：targetId 与当前组件不一致"
                );
            }
            String componentType = trimToNull(normalized.getString("componentType"));
            if (componentType != null && !expectedType.equals(componentType)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：componentType 与当前组件不一致"
                );
            }
            validateDataSourceType(normalized.getString("sourceType"), allowedSourceTypes, scene);
            validateSafeDataConfig(normalized.getJSONObject("dataPatch"), "", scene);
            return;
        }
        if (patches.size() != 1) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：当前请求只能返回一个组件数据补丁"
            );
        }
        JSONObject patch = patches.getJSONObject(0);
        String targetId = patch == null ? null : trimToNull(patch.getString("targetId"));
        if (!expectedId.equals(targetId)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：targetId 与当前组件不一致"
            );
        }
        String componentType = trimToNull(patch.getString("componentType"));
        if (componentType != null && !expectedType.equals(componentType)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：componentType 与当前组件不一致"
            );
        }
        validateDataSourceType(patch.getString("sourceType"), allowedSourceTypes, scene);
        validateSafeDataConfig(patch.getJSONObject("dataPatch"), "", scene);
    }

    private static void validateDataSourceType(
            String sourceType,
            Set<String> allowedSourceTypes,
            AiModelRunScene scene
    ) {
        String normalized = trimToNull(sourceType);
        if (normalized == null || !allowedSourceTypes.contains(normalized)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：sourceType 不在允许的数据源类型中"
            );
        }
    }

    private static void validateSafeDataConfig(
            Object value,
            String path,
            AiModelRunScene scene
    ) {
        if (value instanceof JSONArray array) {
            for (int index = 0; index < array.size(); index++) {
                validateSafeDataConfig(array.get(index), path + "[" + index + "]", scene);
            }
            return;
        }
        if (!(value instanceof JSONObject object)) {
            return;
        }
        for (Map.Entry<String, Object> entry : object.entrySet()) {
            String childPath = path.isEmpty() ? entry.getKey() : path + "." + entry.getKey();
            String key = entry.getKey().trim().toLowerCase();
            if (Set.of(
                    "__proto__",
                    "prototype",
                    "constructor",
                    "base",
                    "style",
                    "status",
                    "layer",
                    "children",
                    "pid",
                    "prev",
                    "next"
            ).contains(key)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：dataPatch 包含禁止字段：" + childPath
                );
            }
            validateSafeDataConfig(entry.getValue(), childPath, scene);
        }
    }

    private static String validateRouteDecisionReply(String reply, AiModelRunScene scene) {
        String trimmedReply = reply.trim();
        String directScene = trimmedReply.startsWith("{")
                || trimmedReply.startsWith("[")
                || trimmedReply.startsWith("\"")
                ? null
                : normalizeRouteDecisionScene(trimmedReply);
        if (directScene != null) {
            JSONObject normalized = new JSONObject();
            normalized.put("scene", directScene);
            return prettyPrint(normalized);
        }

        Object parsed;
        try {
            STRICT_JSON_MAPPER.readTree(reply);
            parsed = JSON.parse(reply);
        } catch (Exception e) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果反序列化失败：" + sanitizeErrorMessage(e.getMessage()));
        }

        if (parsed instanceof String stringValue) {
            String sceneValue = normalizeRouteDecisionScene(stringValue);
            if (sceneValue == null) {
                throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：scene 不在允许的任务类型中");
            }
            JSONObject normalized = new JSONObject();
            normalized.put("scene", sceneValue);
            return prettyPrint(normalized);
        }

        if (!(parsed instanceof JSONObject root)) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：必须输出 JSON 对象");
        }

        JSONObject data = resolvePayload(root);
        String sceneValue = normalizeRouteDecisionScene(firstString(data, "scene", "route", "decision", "tag", "type", "optimizeScene"));
        if (sceneValue == null) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：scene 不在允许的任务类型中");
        }

        JSONObject normalized = new JSONObject();
        normalized.put("scene", sceneValue);
        String reason = trimToNull(data.getString("reason"));
        if (reason != null) {
            normalized.put("reason", reason);
        }
        String summary = trimToNull(data.getString("summary"));
        if (summary != null) {
            normalized.put("summary", summary);
        }
        return prettyPrint(normalized);
    }

    private static String validateWorkflowPlanReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject root = parseObject(reply, scene);
        JSONObject data = resolvePayload(root);
        JSONArray sourceTasks = firstArray(data, "tasks", "steps");
        if (sourceTasks == null || sourceTasks.isEmpty()) {
            String directScene = normalizeRouteDecisionScene(
                    firstString(data, "scene", "route", "decision", "tag", "type", "optimizeScene")
            );
            if (directScene == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：tasks 不能为空"
                );
            }
            sourceTasks = new JSONArray();
            JSONObject task = new JSONObject();
            task.put("id", "task-1");
            task.put("scene", directScene);
            task.put("goal", trimToNull(data.getString("goal")));
            sourceTasks.add(task);
        }
        int maxTasks = validationContext == null
                ? 12
                : Math.max(1, validationContext.getIntValue("maxTasks", 12));
        if (sourceTasks.size() > maxTasks) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：tasks 不能超过 " + maxTasks + " 个"
            );
        }
        Set<String> allowedScenes = Set.of(
                "style-optimize",
                "data-optimize",
                "component-generate",
                "component-replace"
        );
        if (validationContext != null) {
            JSONArray configuredScenes = validationContext.getJSONArray("allowedScenes");
            if (configuredScenes != null && !configuredScenes.isEmpty()) {
                allowedScenes = configuredScenes.stream()
                        .filter(String.class::isInstance)
                        .map(String.class::cast)
                        .map(String::trim)
                        .filter(value -> !value.isEmpty())
                        .collect(java.util.stream.Collectors.toSet());
            }
        }

        JSONArray normalizedTasks = new JSONArray();
        Set<String> taskIds = new HashSet<>();
        for (int index = 0; index < sourceTasks.size(); index++) {
            JSONObject source = sourceTasks.getJSONObject(index);
            if (source == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：tasks[" + index + "] 必须是对象"
                );
            }
            String taskScene = normalizeRouteDecisionScene(
                    firstString(source, "scene", "route", "decision", "tag", "type", "optimizeScene")
            );
            if (taskScene == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：tasks[" + index + "].scene 不合法"
                );
            }
            if (!allowedScenes.contains(taskScene)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：tasks[" + index + "].scene 不在允许范围"
                );
            }
            String taskId = trimToNull(firstString(source, "id", "taskId", "task_id"));
            if (taskId == null) {
                taskId = "task-" + (index + 1);
            }
            if (!taskIds.add(taskId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：任务 id 不能重复：" + taskId
                );
            }
            JSONObject normalizedTask = new JSONObject();
            normalizedTask.put("id", taskId);
            normalizedTask.put("scene", taskScene);
            copyOptionalString(source, normalizedTask, "goal", "prompt", "task");
            copyOptionalString(source, normalizedTask, "reason");
            JSONArray dependsOn = firstArray(source, "dependsOn", "depends_on");
            if (dependsOn != null) {
                JSONArray normalizedDependencies = new JSONArray();
                Set<String> dependencies = new HashSet<>();
                for (Object dependency : dependsOn) {
                    if (!(dependency instanceof String dependencyId)
                            || dependencyId.trim().isEmpty()) {
                        throw new IllegalArgumentException(
                                scene.getDisplayName() + "场景结果校验失败：dependsOn 只能包含任务 id"
                        );
                    }
                    String normalizedDependency = dependencyId.trim();
                    if (taskId.equals(normalizedDependency)) {
                        throw new IllegalArgumentException(
                                scene.getDisplayName() + "场景结果校验失败：任务不能依赖自身"
                        );
                    }
                    if (dependencies.add(normalizedDependency)) {
                        normalizedDependencies.add(normalizedDependency);
                    }
                }
                if (!normalizedDependencies.isEmpty()) {
                    normalizedTask.put("dependsOn", normalizedDependencies);
                }
            }
            normalizedTasks.add(normalizedTask);
        }
        for (Object value : normalizedTasks) {
            JSONObject task = (JSONObject) value;
            JSONArray dependencies = task.getJSONArray("dependsOn");
            if (dependencies == null) {
                continue;
            }
            for (Object dependency : dependencies) {
                if (!taskIds.contains(String.valueOf(dependency))) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：dependsOn 引用了不存在的任务："
                                    + dependency
                    );
                }
            }
        }

        JSONObject normalized = new JSONObject();
        normalized.put(
                "summary",
                trimToNull(data.getString("summary")) == null
                        ? "AI 工作流规划完成"
                        : data.getString("summary").trim()
        );
        normalized.put(
                "reason",
                trimToNull(data.getString("reason")) == null
                        ? ""
                        : data.getString("reason").trim()
        );
        normalized.put("tasks", normalizedTasks);
        return prettyPrint(normalized);
    }

    private static String validateComponentReplaceReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        String summary = requireString(
                data,
                "summary",
                scene.getDisplayName() + "场景结果校验失败：summary 不能为空"
        );
        String reason = requireString(
                data,
                "reason",
                scene.getDisplayName() + "场景结果校验失败：reason 不能为空"
        );
        String targetId = requireString(
                data,
                new String[]{"targetId", "target_id", "id", "tempId"},
                scene.getDisplayName() + "场景结果校验失败：targetId 不能为空"
        );
        String componentType = requireString(
                data,
                new String[]{"componentType", "component_type", "componentKey", "type"},
                scene.getDisplayName() + "场景结果校验失败：componentType 不能为空"
        );
        if (validationContext != null) {
            JSONArray allowedValues = validationContext.getJSONArray("allowedComponentTypes");
            if (allowedValues != null && !allowedValues.isEmpty()) {
                Set<String> allowed = allowedValues.stream()
                        .filter(String.class::isInstance)
                        .map(String.class::cast)
                        .map(String::trim)
                        .filter(value -> !value.isEmpty())
                        .collect(java.util.stream.Collectors.toSet());
                if (!allowed.contains(componentType)) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：componentType 不在允许的组件目录中"
                    );
                }
            }
            String expectedTargetId = trimToNull(validationContext.getString("targetId"));
            if (expectedTargetId != null && !expectedTargetId.equals(targetId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：targetId 与当前替换目标不一致"
                );
            }
            String sourceComponentType = trimToNull(
                    validationContext.getString("sourceComponentType")
            );
            if (sourceComponentType != null && sourceComponentType.equals(componentType)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：替换组件不能与原组件类型相同"
                );
            }
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", summary);
        normalized.put("reason", reason);
        normalized.put("targetId", targetId);
        normalized.put("componentType", componentType);
        copyOptionalString(data, normalized, "componentName", "component_name", "name");
        return prettyPrint(normalized);
    }

    private static String validateComponentSelectReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        String summary = requireString(data, "summary", scene.getDisplayName() + "场景结果校验失败：summary 不能为空");
        String reason = requireString(data, "reason", scene.getDisplayName() + "场景结果校验失败：reason 不能为空");

        JSONArray selectedComponentsValue = firstArray(data, "selectedComponents", "components", "items", "componentList");
        if (selectedComponentsValue == null || selectedComponentsValue.isEmpty()) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：selectedComponents 不能为空");
        }
        Set<String> allowedTypes = validationContext == null
                ? Set.of()
                : requireStringSet(validationContext, "allowedComponentTypes", scene);
        Integer configuredMaxComponents = validationContext == null
                ? null
                : validationContext.getInteger("maxComponents");
        int maxComponents = validationContext == null
                ? Integer.MAX_VALUE
                : Math.max(1, configuredMaxComponents == null ? 20 : configuredMaxComponents);
        if (selectedComponentsValue.size() > maxComponents) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：selectedComponents 不能超过 " + maxComponents + " 个"
            );
        }
        String idPrefix = validationContext == null
                ? null
                : trimToNull(validationContext.getString("idPrefix"));
        Set<String> requiredVisualElements = validationContext != null
                && validationContext.getJSONArray("requiredVisualElements") != null
                ? requireStringSet(validationContext, "requiredVisualElements", scene)
                : Set.of();
        Set<String> coveredVisualElements = new HashSet<>();

        JSONArray normalizedComponents = new JSONArray();
        Set<String> tempIds = new HashSet<>();
        for (int index = 0; index < selectedComponentsValue.size(); index++) {
            Object itemValue = selectedComponentsValue.get(index);
            if (!(itemValue instanceof JSONObject item)) {
                throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：selectedComponents[" + index + "] 必须是对象");
            }

            String tempId = requireString(
                    item,
                    new String[]{"tempId", "id", "key"},
                    scene.getDisplayName() + "场景结果校验失败：selectedComponents[" + index + "].tempId 不能为空"
            );
            String componentType = requireString(
                    item,
                    new String[]{"componentType", "componentKey", "type", "componentName", "name"},
                    scene.getDisplayName() + "场景结果校验失败：selectedComponents[" + index + "].componentType 不能为空"
            );
            if (!tempIds.add(tempId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：selectedComponents.tempId 不能重复：" + tempId
                );
            }
            if (idPrefix != null && !tempId.startsWith(idPrefix)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：tempId 必须以 " + idPrefix + " 开头"
                );
            }
            if (!allowedTypes.isEmpty() && !allowedTypes.contains(componentType)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：组件类型不在当前组件库中：" + componentType
                );
            }

            JSONObject normalizedItem = new JSONObject();
            normalizedItem.put("tempId", tempId);
            normalizedItem.put("componentType", componentType);
            copyOptionalString(item, normalizedItem, "componentName", "name");
            copyOptionalString(item, normalizedItem, "role", "sceneRole");
            copyOptionalString(item, normalizedItem, "reason");

            if (!requiredVisualElements.isEmpty()) {
                JSONArray sourceElements = firstArray(item, "sourceVisualElements", "sourceElements");
                if (sourceElements == null || sourceElements.isEmpty()) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：selectedComponents[" + index
                                    + "].sourceVisualElements 不能为空"
                    );
                }
                JSONArray normalizedSourceElements = new JSONArray();
                for (Object sourceElement : sourceElements) {
                    if (!(sourceElement instanceof String text)
                            || trimToNull(text) == null
                            || !requiredVisualElements.contains(text.trim())) {
                        throw new IllegalArgumentException(
                                scene.getDisplayName() + "场景结果校验失败：组件引用了区域中不存在的视觉元素"
                        );
                    }
                    if (coveredVisualElements.add(text.trim())) {
                        normalizedSourceElements.add(text.trim());
                    } else if (!normalizedSourceElements.contains(text.trim())) {
                        normalizedSourceElements.add(text.trim());
                    }
                }
                normalizedItem.put("sourceVisualElements", normalizedSourceElements);
                normalizedItem.put(
                        "renderedVisualElement",
                        requireString(
                                item,
                                "renderedVisualElement",
                                scene.getDisplayName() + "场景结果校验失败：renderedVisualElement 不能为空"
                        )
                );
                normalizedItem.put(
                        "visualEvidence",
                        requireString(
                                item,
                                "visualEvidence",
                                scene.getDisplayName() + "场景结果校验失败：visualEvidence 不能为空"
                        )
                );
            }

            if (item.containsKey("parentTempId") || item.containsKey("parentId") || item.containsKey("pid")) {
                Object parentValue = firstValue(item, "parentTempId", "parentId", "pid");
                normalizedItem.put("parentTempId", normalizeParentTempId(parentValue));
            }

            normalizedComponents.add(normalizedItem);
        }
        validateSelectionParents(normalizedComponents, scene);
        if (!coveredVisualElements.containsAll(requiredVisualElements)) {
            Set<String> missing = new HashSet<>(requiredVisualElements);
            missing.removeAll(coveredVisualElements);
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：未覆盖全部区域视觉元素：" + String.join("、", missing)
            );
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", summary);
        normalized.put("reason", reason);
        normalized.put("sceneType", trimToNull(firstString(data, "sceneType", "scene", "type")) == null
                ? "custom"
                : trimToNull(firstString(data, "sceneType", "scene", "type")));
        normalized.put("selectedComponents", normalizedComponents);
        return prettyPrint(normalized);
    }

    private static String validateComponentLayoutReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        String summary = requireString(data, "summary", scene.getDisplayName() + "场景结果校验失败：summary 不能为空");
        String reason = requireString(data, "reason", scene.getDisplayName() + "场景结果校验失败：reason 不能为空");

        JSONArray layersValue = firstArray(data, "layers", "items", "components", "layout");
        if (layersValue == null || layersValue.isEmpty()) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：layers 不能为空");
        }

        JSONArray normalizedLayers = new JSONArray();
        collectComponentLayoutItems(layersValue, null, scene, normalizedLayers);
        if (normalizedLayers.isEmpty()) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：layers 不能为空");
        }
        if (validationContext != null) {
            validateComponentLayoutAgainstContext(normalizedLayers, validationContext, scene);
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", summary);
        normalized.put("reason", reason);
        String sceneType = trimToNull(firstString(data, "sceneType", "scene", "type"));
        normalized.put("sceneType", sceneType == null ? "custom" : sceneType);
        normalized.put("layers", normalizedLayers);
        return prettyPrint(normalized);
    }

    private static String validateComponentGenerateReply(
            String reply,
            AiModelRunScene scene,
            JSONObject validationContext
    ) {
        JSONObject payload = parseObject(reply, scene);
        JSONObject data = resolvePayload(payload);
        String summary = requireString(data, "summary", scene.getDisplayName() + "场景结果校验失败：summary 不能为空");
        String reason = requireString(data, "reason", scene.getDisplayName() + "场景结果校验失败：reason 不能为空");
        String targetId = requireString(
                data,
                new String[]{"targetId", "target_id", "id", "tempId"},
                scene.getDisplayName() + "场景结果校验失败：targetId 不能为空"
        );
        String componentType = requireString(
                data,
                new String[]{"componentType", "component_type", "componentKey", "type"},
                scene.getDisplayName() + "场景结果校验失败：componentType 不能为空"
        );

        JSONObject configPatch = firstObject(data, "configPatch", "config_patch", "config", "patch");
        if (configPatch == null || configPatch.isEmpty()) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：configPatch 必须是非空对象");
        }
        if (validationContext != null) {
            validateGeneratedComponentAgainstContext(
                    targetId,
                    componentType,
                    configPatch,
                    validationContext,
                    scene
            );
        }

        JSONObject normalized = new JSONObject();
        normalized.put("summary", summary);
        normalized.put("reason", reason);
        normalized.put("targetId", targetId);
        normalized.put("componentType", componentType);
        String componentName = trimToNull(firstString(data, "componentName", "component_name", "name"));
        if (componentName != null) {
            normalized.put("componentName", componentName);
        }
        normalized.put("configPatch", configPatch);
        return prettyPrint(normalized);
    }

    private static void collectComponentLayoutItems(
            JSONArray source,
            String fallbackPid,
            AiModelRunScene scene,
            JSONArray target
    ) {
        for (int index = 0; index < source.size(); index++) {
            Object itemValue = source.get(index);
            collectComponentLayoutItem(itemValue, index, fallbackPid, scene, target);
        }
    }

    private static void collectComponentLayoutItem(
            Object value,
            int index,
            String fallbackPid,
            AiModelRunScene scene,
            JSONArray target
    ) {
        if (!(value instanceof JSONObject item)) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果校验失败：layers[" + index + "] 必须是对象");
        }

        String id = requireString(
                item,
                new String[]{"id", "tempId", "key"},
                scene.getDisplayName() + "场景结果校验失败：layers[" + index + "].id 不能为空"
        );
        String layerType = requireString(
                item,
                new String[]{"type", "componentType", "componentKey"},
                scene.getDisplayName() + "场景结果校验失败：layers[" + index + "].type 不能为空"
        );
        String name = trimToNull(firstString(item, "name", "componentName", "label"));
        if (name == null) {
            name = layerType;
        }

        JSONObject normalizedItem = new JSONObject();
        normalizedItem.put("id", id);
        normalizedItem.put("name", name);
        normalizedItem.put("type", layerType);

        putNumberIfPresent(normalizedItem, "width", firstValue(item, "width"));
        putNumberIfPresent(normalizedItem, "height", firstValue(item, "height"));
        putNumberIfPresent(normalizedItem, "x", firstValue(item, "x"));
        putNumberIfPresent(normalizedItem, "y", firstValue(item, "y"));
        if (item.containsKey("order")) {
            putNumberIfPresent(normalizedItem, "order", firstValue(item, "order"));
        } else {
            normalizedItem.put("order", target.size() + 1);
        }

        String pid = trimToNull(firstString(item, "pid", "parentId", "parentTempId"));
        if (pid == null) {
            pid = trimToNull(fallbackPid);
        }
        if (pid != null) {
            normalizedItem.put("pid", pid);
        }

        target.add(normalizedItem);

        JSONArray children = item.getJSONArray("children");
        if (children != null && !children.isEmpty()) {
            collectComponentLayoutItems(children, id, scene, target);
        }
    }

    private static Set<String> requireStringSet(
            JSONObject context,
            String field,
            AiModelRunScene scene
    ) {
        JSONArray values = context == null ? null : context.getJSONArray(field);
        if (values == null || values.isEmpty()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景 validationContext." + field + " 不能为空"
            );
        }
        Set<String> result = new HashSet<>();
        for (Object value : values) {
            if (!(value instanceof String text) || trimToNull(text) == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景 validationContext." + field + " 只能包含非空字符串"
                );
            }
            result.add(text.trim());
        }
        return result;
    }

    private static void validateSelectionParents(JSONArray components, AiModelRunScene scene) {
        Map<String, JSONObject> byId = new HashMap<>();
        for (Object value : components) {
            JSONObject component = (JSONObject) value;
            byId.put(component.getString("tempId"), component);
        }
        for (Object value : components) {
            JSONObject component = (JSONObject) value;
            String componentId = component.getString("tempId");
            String parentId = trimToNull(component.getString("parentTempId"));
            if (parentId == null) {
                continue;
            }
            if (parentId.equals(componentId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：组件不能将自身设为父节点：" + componentId
                );
            }
            if (!byId.containsKey(parentId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：父节点不存在：" + parentId
                );
            }
            Set<String> visited = new HashSet<>();
            String cursor = componentId;
            while (cursor != null) {
                if (!visited.add(cursor)) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：组件父子关系存在循环：" + componentId
                    );
                }
                JSONObject current = byId.get(cursor);
                cursor = current == null ? null : trimToNull(current.getString("parentTempId"));
            }
        }
    }

    private static void validateComponentLayoutAgainstContext(
            JSONArray layers,
            JSONObject context,
            AiModelRunScene scene
    ) {
        Map<String, JSONObject> expectedComponents = requireExpectedComponents(context, scene);
        if (layers.size() != expectedComponents.size()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：布局必须完整覆盖全部 "
                            + expectedComponents.size() + " 个已选组件"
            );
        }
        JSONObject region = context.getJSONObject("region");
        if (region == null) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景 validationContext.region 不能为空");
        }
        double regionX = requireFiniteContextNumber(region, "x", scene);
        double regionY = requireFiniteContextNumber(region, "y", scene);
        double regionWidth = requirePositiveContextNumber(region, "width", scene);
        double regionHeight = requirePositiveContextNumber(region, "height", scene);
        Set<String> actualIds = new HashSet<>();
        Set<Integer> actualOrders = new HashSet<>();

        for (int index = 0; index < layers.size(); index++) {
            JSONObject layer = layers.getJSONObject(index);
            String componentId = layer.getString("id");
            JSONObject expected = expectedComponents.get(componentId);
            if (expected == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：布局包含未知组件：" + componentId
                );
            }
            if (!actualIds.add(componentId)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：布局组件 id 重复：" + componentId
                );
            }
            String expectedType = requireString(
                    expected,
                    "componentType",
                    scene.getDisplayName() + "场景 validationContext 中 componentType 不能为空"
            );
            if (!expectedType.equals(layer.getString("type"))) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：布局组件类型不匹配：" + componentId
                );
            }
            double x = requireFiniteContextNumber(layer, "x", scene);
            double y = requireFiniteContextNumber(layer, "y", scene);
            double width = requirePositiveContextNumber(layer, "width", scene);
            double height = requirePositiveContextNumber(layer, "height", scene);
            if (x < regionX
                    || y < regionY
                    || x + width > regionX + regionWidth
                    || y + height > regionY + regionHeight) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：组件布局超出当前区域：" + componentId
                );
            }
            Object orderValue = layer.get("order");
            if (!(orderValue instanceof Number orderNumber)
                    || !Double.isFinite(orderNumber.doubleValue())
                    || orderNumber.doubleValue() != Math.rint(orderNumber.doubleValue())
                    || orderNumber.intValue() < 1
                    || orderNumber.intValue() > layers.size()
                    || !actualOrders.add(orderNumber.intValue())) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：order 必须是从 1 开始且不重复的整数"
                );
            }
            String expectedParent = trimToNull(expected.getString("parentComponentId"));
            String actualParent = trimToNull(layer.getString("pid"));
            if (expectedParent == null ? actualParent != null : !expectedParent.equals(actualParent)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：父子关系与组件选择结果不一致：" + componentId
                );
            }
        }
    }

    private static void validateGeneratedComponentAgainstContext(
            String targetId,
            String componentType,
            JSONObject configPatch,
            JSONObject context,
            AiModelRunScene scene
    ) {
        JSONObject expected = context.getJSONObject("expectedComponent");
        if (expected == null) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景 validationContext.expectedComponent 不能为空"
            );
        }
        String expectedId = requireString(
                expected,
                "componentId",
                scene.getDisplayName() + "场景 validationContext.expectedComponent.componentId 不能为空"
        );
        String expectedType = requireString(
                expected,
                "componentType",
                scene.getDisplayName() + "场景 validationContext.expectedComponent.componentType 不能为空"
        );
        if (!expectedId.equals(targetId) || !expectedType.equals(componentType)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：目标组件 id 或类型与当前任务不一致"
            );
        }
        Set<String> allowedSections = requireStringSet(expected, "allowedConfigSections", scene);
        for (String section : configPatch.keySet()) {
            if (!allowedSections.contains(section)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：configPatch 包含组件协议外字段：" + section
                );
            }
        }
        validateGeneratedConfigValue(configPatch, "", scene);
    }

    private static void validateGeneratedConfigValue(
            Object value,
            String path,
            AiModelRunScene scene
    ) {
        if (value instanceof JSONArray array) {
            for (int index = 0; index < array.size(); index++) {
                validateGeneratedConfigValue(array.get(index), path + "[" + index + "]", scene);
            }
            return;
        }
        if (!(value instanceof JSONObject object)) {
            return;
        }
        for (Map.Entry<String, Object> entry : object.entrySet()) {
            String childPath = path.isEmpty() ? entry.getKey() : path + "." + entry.getKey();
            String normalizedKey = entry.getKey().trim().toLowerCase();
            if ("__proto__".equals(normalizedKey)
                    || "prototype".equals(normalizedKey)
                    || "constructor".equals(normalizedKey)
                    || "handler".equals(normalizedKey)
                    || "script".equals(normalizedKey)
                    || "customcode".equals(normalizedKey)
                    || "customdataupdatecode".equals(normalizedKey)
                    || "base.id".equalsIgnoreCase(childPath)
                    || "base.type".equalsIgnoreCase(childPath)
                    || "data.filter".equalsIgnoreCase(childPath)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：configPatch 包含禁止字段：" + childPath
                );
            }
            validateGeneratedConfigValue(entry.getValue(), childPath, scene);
        }
    }

    private static double requireFiniteContextNumber(
            JSONObject object,
            String key,
            AiModelRunScene scene
    ) {
        Object value = object.get(key);
        if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：" + key + " 必须是有限数字"
            );
        }
        return number.doubleValue();
    }

    private static double requirePositiveContextNumber(
            JSONObject object,
            String key,
            AiModelRunScene scene
    ) {
        double value = requireFiniteContextNumber(object, key, scene);
        if (value <= 0) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：" + key + " 必须大于 0"
            );
        }
        return value;
    }

    private static double[] requireValidationCanvas(JSONObject context, AiModelRunScene scene) {
        JSONObject canvas = context == null ? null : context.getJSONObject("canvas");
        Object widthValue = canvas == null ? null : canvas.get("width");
        Object heightValue = canvas == null ? null : canvas.get("height");
        if (!(widthValue instanceof Number width)
                || !(heightValue instanceof Number height)
                || !Double.isFinite(width.doubleValue())
                || !Double.isFinite(height.doubleValue())
                || width.doubleValue() <= 0
                || height.doubleValue() <= 0) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景 validationContext.canvas 必须包含正数 width 和 height"
            );
        }
        return new double[]{width.doubleValue(), height.doubleValue()};
    }

    private static void validateRegionOverlap(JSONArray regions, AiModelRunScene scene) {
        for (int leftIndex = 0; leftIndex < regions.size(); leftIndex++) {
            JSONObject left = regions.getJSONObject(leftIndex);
            for (int rightIndex = leftIndex + 1; rightIndex < regions.size(); rightIndex++) {
                JSONObject right = regions.getJSONObject(rightIndex);
                double overlapWidth = Math.min(
                        left.getDoubleValue("x") + left.getDoubleValue("width"),
                        right.getDoubleValue("x") + right.getDoubleValue("width")
                ) - Math.max(left.getDoubleValue("x"), right.getDoubleValue("x"));
                double overlapHeight = Math.min(
                        left.getDoubleValue("y") + left.getDoubleValue("height"),
                        right.getDoubleValue("y") + right.getDoubleValue("height")
                ) - Math.max(left.getDoubleValue("y"), right.getDoubleValue("y"));
                if (overlapWidth > 0 && overlapHeight > 0) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：区域不能重叠："
                                    + left.getString("id") + "、" + right.getString("id")
                    );
                }
            }
        }
    }

    private static Map<String, JSONObject> requireExpectedComponents(
            JSONObject context,
            AiModelRunScene scene
    ) {
        JSONArray expected = context == null ? null : context.getJSONArray("expectedComponents");
        if (expected == null || expected.isEmpty()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景 validationContext.expectedComponents 不能为空"
            );
        }
        Map<String, JSONObject> result = new HashMap<>();
        for (int index = 0; index < expected.size(); index++) {
            JSONObject component = expected.getJSONObject(index);
            if (component == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景 validationContext.expectedComponents[" + index + "] 必须是对象"
                );
            }
            String componentId = requireString(
                    component,
                    "componentId",
                    scene.getDisplayName() + "场景 validationContext.expectedComponents[" + index + "].componentId 不能为空"
            );
            if (result.put(componentId, component) != null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景 validationContext 中 componentId 不能重复：" + componentId
                );
            }
        }
        return result;
    }

    private static void validateStylePaths(
            JSONObject style,
            JSONObject expected,
            AiModelRunScene scene,
            int patchIndex
    ) {
        Map<String, JSONObject> allowedRules = new HashMap<>();
        JSONArray ruleValues = expected.getJSONArray("allowedStyleRules");
        if (ruleValues != null) {
            for (Object value : ruleValues) {
                if (!(value instanceof JSONObject rule)) {
                    continue;
                }
                String path = trimToNull(rule.getString("path"));
                String type = trimToNull(rule.getString("type"));
                if (path != null && type != null) {
                    JSONObject normalizedRule = new JSONObject(rule);
                    normalizedRule.put("path", path);
                    normalizedRule.put("type", type);
                    allowedRules.put(path, normalizedRule);
                }
            }
        }
        JSONArray allowedValue = expected.getJSONArray("allowedStylePaths");
        Set<String> allowedPaths = new HashSet<>();
        if (allowedValue != null) {
            for (Object value : allowedValue) {
                if (value instanceof String path && trimToNull(path) != null) {
                    allowedPaths.add(path.trim());
                    allowedRules.putIfAbsent(
                            path.trim(),
                            new JSONObject(Map.of("path", path.trim(), "type", "any"))
                    );
                }
            }
        }
        if (allowedRules.isEmpty()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景 validationContext 缺少允许的样式字段："
                            + expected.getString("componentId")
            );
        }

        Map<String, Object> actualValues = new HashMap<>();
        collectLeafValues(style, "", actualValues);
        if (actualValues.isEmpty()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：patches[" + patchIndex + "].stylePatch.style 不能只包含空对象"
            );
        }
        for (Map.Entry<String, Object> entry : actualValues.entrySet()) {
            String path = entry.getKey();
            if (containsUnsafeConfigSegment(path)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：样式补丁包含禁止字段：" + path
                );
            }
            JSONObject rule = allowedRules.get(path);
            if (rule == null) {
                rule = allowedRules.entrySet().stream()
                        .filter(candidateRule -> {
                            String parentType = candidateRule.getValue().getString("type");
                            return ("any".equalsIgnoreCase(parentType) || "object".equalsIgnoreCase(parentType))
                                    && path.startsWith(candidateRule.getKey() + ".");
                        })
                        .map(Map.Entry::getValue)
                        .findFirst()
                        .orElse(null);
            }
            if (rule == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：样式字段不在组件协议中：" + path
                );
            }
            validateStyleValue(entry.getValue(), rule, path, scene);
        }
    }

    private static void collectLeafValues(Object value, String prefix, Map<String, Object> result) {
        if (value instanceof JSONObject object) {
            if (object.isEmpty() && !prefix.isEmpty()) {
                return;
            }
            for (Map.Entry<String, Object> entry : object.entrySet()) {
                String path = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
                collectLeafValues(entry.getValue(), path, result);
            }
            return;
        }
        if (!prefix.isEmpty()) {
            result.put(prefix, value);
        }
    }

    private static void validateStyleValue(
            Object value,
            JSONObject rule,
            String path,
            AiModelRunScene scene
    ) {
        String expectedType = rule.getString("type");
        if (value == null && (rule.getBooleanValue("allowNull") || "null".equals(expectedType))) {
            return;
        }
        if (Boolean.FALSE.equals(value) && rule.getBooleanValue("allowFalse")) {
            return;
        }
        boolean valid = switch (expectedType) {
            case "any" -> true;
            case "string", "color" -> value instanceof String;
            case "number" -> value instanceof Number number && Double.isFinite(number.doubleValue());
            case "boolean" -> value instanceof Boolean;
            case "array" -> value instanceof JSONArray;
            case "object" -> value instanceof JSONObject;
            case "null" -> value == null;
            case "colorOrColorArray" -> value instanceof String
                    || value instanceof JSONArray array
                    && array.stream().allMatch(item -> item instanceof String);
            case "numberOrArray" -> isNumberOrNumberArray(value);
            case "numberOrArrayOrAuto" -> "auto".equals(value) || isNumberOrNumberArray(value);
            default -> false;
        };
        if (!valid) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：样式字段类型不符合组件协议："
                            + path + " 应为 " + expectedType
            );
        }
        validateStyleEnum(value, rule, path, scene);
        validateStyleNumberRange(value, rule, path, scene);
    }

    private static boolean isNumberOrNumberArray(Object value) {
        if (value instanceof Number number) {
            return Double.isFinite(number.doubleValue());
        }
        return value instanceof JSONArray array
                && array.stream().allMatch(item -> item instanceof Number number
                && Double.isFinite(number.doubleValue()));
    }

    private static void validateStyleEnum(
            Object value,
            JSONObject rule,
            String path,
            AiModelRunScene scene
    ) {
        JSONArray enumValues = rule.getJSONArray("enumValues");
        if (enumValues != null && !enumValues.isEmpty() && !enumValues.contains(value)) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：样式字段取值不在组件协议枚举中：" + path
            );
        }
    }

    private static void validateStyleNumberRange(
            Object value,
            JSONObject rule,
            String path,
            AiModelRunScene scene
    ) {
        Number min = rule.getObject("min", Number.class);
        Number max = rule.getObject("max", Number.class);
        if (min == null && max == null) {
            return;
        }
        List<Double> values = new ArrayList<>();
        if (value instanceof Number number) {
            values.add(number.doubleValue());
        } else if (value instanceof JSONArray array) {
            for (Object item : array) {
                if (item instanceof Number number) {
                    values.add(number.doubleValue());
                }
            }
        }
        for (double number : values) {
            if ((min != null && number < min.doubleValue())
                    || (max != null && number > max.doubleValue())) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：样式字段超出组件协议范围：" + path
                );
            }
        }
    }

    private static boolean containsUnsafeConfigSegment(String path) {
        for (String segment : path.split("\\.")) {
            String normalized = segment.trim().toLowerCase();
            if ("__proto__".equals(normalized)
                    || "prototype".equals(normalized)
                    || "constructor".equals(normalized)
                    || "filter".equals(normalized)
                    || "handler".equals(normalized)
                    || "customcode".equals(normalized)
                    || "customdataupdatecode".equals(normalized)
                    || "script".equals(normalized)) {
                return true;
            }
        }
        return false;
    }

    private static void validateStaticDataPatch(
            JSONObject dataPatch,
            JSONObject expected,
            AiModelRunScene scene,
            int patchIndex
    ) {
        Set<String> allowedKeys = Set.of("sourceType", "value", "staticData");
        for (String key : dataPatch.keySet()) {
            if (!allowedKeys.contains(key)) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：patches[" + patchIndex
                                + "].dataPatch 包含禁止字段：" + key
                );
            }
        }
        if (!"static".equals(dataPatch.getString("sourceType"))) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：patches[" + patchIndex
                            + "].dataPatch.sourceType 必须是 static"
            );
        }

        boolean hasValue = dataPatch.containsKey("value");
        JSONObject staticData = dataPatch.getJSONObject("staticData");
        boolean hasStaticValue = staticData != null && staticData.containsKey("value");
        if (hasValue == hasStaticValue) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：patches[" + patchIndex
                            + "].dataPatch 必须且只能提供 value 或 staticData.value"
            );
        }
        if (staticData != null && staticData.keySet().stream().anyMatch(key -> !"value".equals(key))) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：patches[" + patchIndex
                            + "].dataPatch.staticData 只能包含 value"
            );
        }

        Object actualValue = hasValue ? dataPatch.get("value") : staticData.get("value");
        JSONObject valueSchema = expected.getJSONObject("valueSchema");
        if (valueSchema != null) {
            validateJsonAgainstDataSchema(
                    actualValue,
                    valueSchema,
                    "patches[" + patchIndex + "].dataPatch." + (hasValue ? "value" : "staticData.value"),
                    scene
            );
            return;
        }
        Object expectedShape = expected.get("valueShape");
        if (expectedShape != null) {
            validateJsonShape(
                    actualValue,
                    expectedShape,
                    "patches[" + patchIndex + "].dataPatch." + (hasValue ? "value" : "staticData.value"),
                    scene
            );
        }
    }

    private static void validateJsonAgainstDataSchema(
            Object actual,
            JSONObject schema,
            String path,
            AiModelRunScene scene
    ) {
        String type = trimToNull(schema.getString("type"));
        if (type == null) {
            throw shapeError(scene, path, "缺少运行时数据类型规则");
        }
        if (actual == null) {
            if (schema.getBooleanValue("allowNull") || "any".equals(type)) {
                return;
            }
            throw shapeError(scene, path, "不能为空");
        }
        switch (type) {
            case "any" -> {
                return;
            }
            case "string" -> {
                if (!(actual instanceof String)) {
                    throw shapeError(scene, path, "必须是字符串");
                }
            }
            case "number" -> {
                if (!(actual instanceof Number number) || !Double.isFinite(number.doubleValue())) {
                    throw shapeError(scene, path, "必须是有限数字");
                }
            }
            case "boolean" -> {
                if (!(actual instanceof Boolean)) {
                    throw shapeError(scene, path, "必须是布尔值");
                }
            }
            case "array" -> validateDataArray(actual, schema, path, scene);
            case "object" -> validateDataObject(actual, schema, path, scene);
            default -> throw shapeError(scene, path, "包含不支持的运行时数据类型：" + type);
        }
    }

    private static void validateDataArray(
            Object actual,
            JSONObject schema,
            String path,
            AiModelRunScene scene
    ) {
        if (!(actual instanceof JSONArray array)) {
            throw shapeError(scene, path, "必须是数组");
        }
        Integer minItems = schema.getInteger("minItems");
        Integer maxItems = schema.getInteger("maxItems");
        if (minItems != null && array.size() < minItems) {
            throw shapeError(scene, path, "数组项数量不能少于 " + minItems);
        }
        if (maxItems != null && array.size() > maxItems) {
            throw shapeError(scene, path, "数组项数量不能超过 " + maxItems);
        }
        JSONObject itemSchema = schema.getJSONObject("itemSchema");
        if (itemSchema != null) {
            for (int index = 0; index < array.size(); index++) {
                validateJsonAgainstDataSchema(array.get(index), itemSchema, path + "[" + index + "]", scene);
            }
        }
    }

    private static void validateDataObject(
            Object actual,
            JSONObject schema,
            String path,
            AiModelRunScene scene
    ) {
        if (!(actual instanceof JSONObject object)) {
            throw shapeError(scene, path, "必须是对象");
        }
        JSONArray fields = schema.getJSONArray("fields");
        Map<String, JSONObject> fieldRules = new HashMap<>();
        if (fields != null) {
            for (Object fieldValue : fields) {
                if (!(fieldValue instanceof JSONObject field)) {
                    throw shapeError(scene, path, "运行时对象字段规则不合法");
                }
                String fieldName = trimToNull(field.getString("name"));
                JSONObject fieldSchema = field.getJSONObject("schema");
                if (fieldName == null || fieldSchema == null || fieldRules.put(fieldName, field) != null) {
                    throw shapeError(scene, path, "运行时对象字段规则缺失或重复");
                }
                if (field.getBooleanValue("required") && !object.containsKey(fieldName)) {
                    throw shapeError(scene, path + "." + fieldName, "缺少必填字段");
                }
            }
        }
        if (!schema.getBooleanValue("allowAdditionalFields")) {
            for (String fieldName : object.keySet()) {
                if (!fieldRules.containsKey(fieldName)) {
                    throw shapeError(scene, path + "." + fieldName, "不在组件运行时数据协议中");
                }
            }
        }
        for (Map.Entry<String, Object> entry : object.entrySet()) {
            JSONObject field = fieldRules.get(entry.getKey());
            if (field != null) {
                validateJsonAgainstDataSchema(
                        entry.getValue(),
                        field.getJSONObject("schema"),
                        path + "." + entry.getKey(),
                        scene
                );
            }
        }
    }

    private static void validateJsonShape(
            Object actual,
            Object expected,
            String path,
            AiModelRunScene scene
    ) {
        if (expected == null) {
            return;
        }
        if (expected instanceof JSONObject expectedObject) {
            if (!(actual instanceof JSONObject actualObject)) {
                throw shapeError(scene, path, "必须是对象");
            }
            for (String key : actualObject.keySet()) {
                if (!expectedObject.containsKey(key)) {
                    throw shapeError(scene, path + "." + key, "不在组件默认数据结构中");
                }
                validateJsonShape(actualObject.get(key), expectedObject.get(key), path + "." + key, scene);
            }
            return;
        }
        if (expected instanceof JSONArray expectedArray) {
            if (!(actual instanceof JSONArray actualArray)) {
                throw shapeError(scene, path, "必须是数组");
            }
            if (!expectedArray.isEmpty()) {
                Object itemShape = expectedArray.get(0);
                for (int index = 0; index < actualArray.size(); index++) {
                    validateJsonShape(actualArray.get(index), itemShape, path + "[" + index + "]", scene);
                }
            }
            return;
        }
        if (expected instanceof Number && actual instanceof Number) {
            return;
        }
        if (expected instanceof String && actual instanceof String) {
            return;
        }
        if (expected instanceof Boolean && actual instanceof Boolean) {
            return;
        }
        if (!expected.getClass().isInstance(actual)) {
            throw shapeError(scene, path, "类型与组件默认数据结构不一致");
        }
    }

    private static IllegalArgumentException shapeError(
            AiModelRunScene scene,
            String path,
            String message
    ) {
        return new IllegalArgumentException(
                scene.getDisplayName() + "场景结果校验失败：" + path + " " + message
        );
    }

    private static void requireOnlyKeys(
            JSONObject object,
            Set<String> allowedKeys,
            String message
    ) {
        if (object.keySet().stream().anyMatch(key -> !allowedKeys.contains(key))) {
            throw new IllegalArgumentException(message);
        }
    }

    private static JSONArray requireNonEmptyStringArray(
            JSONObject object,
            String field,
            AiModelRunScene scene,
            int regionIndex
    ) {
        JSONArray values = object.getJSONArray(field);
        if (values == null || values.isEmpty()) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：regions[" + regionIndex + "]." + field + " 不能为空"
            );
        }
        JSONArray normalized = new JSONArray();
        Set<String> seen = new HashSet<>();
        for (Object value : values) {
            if (!(value instanceof String text) || trimToNull(text) == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：regions[" + regionIndex + "]."
                                + field + " 只能包含非空字符串"
                );
            }
            if (seen.add(text.trim())) {
                normalized.add(text.trim());
            }
        }
        return normalized;
    }

    private static double[] requireValidationSourceImage(
            JSONObject validationContext,
            AiModelRunScene scene
    ) {
        JSONObject sourceImage = validationContext == null
                ? null
                : validationContext.getJSONObject("sourceImage");
        Object widthValue = sourceImage == null ? null : sourceImage.get("width");
        Object heightValue = sourceImage == null ? null : sourceImage.get("height");
        if (!(widthValue instanceof Number width)
                || !(heightValue instanceof Number height)
                || !Double.isFinite(width.doubleValue())
                || !Double.isFinite(height.doubleValue())
                || width.doubleValue() <= 0
                || height.doubleValue() <= 0) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景 validationContext.sourceImage 尺寸不合法"
            );
        }
        return new double[]{width.doubleValue(), height.doubleValue()};
    }

    private static JSONObject requirePoint(
            JSONObject region,
            String field,
            int regionIndex,
            AiModelRunScene scene
    ) {
        JSONObject point = region.getJSONObject(field);
        if (point == null) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：regions[" + regionIndex + "]." + field + " 必须是对象"
            );
        }
        requireOnlyKeys(
                point,
                Set.of("x", "y"),
                scene.getDisplayName() + "场景结果校验失败：" + field + " 只能包含 x 和 y"
        );
        Object xValue = point.get("x");
        Object yValue = point.get("y");
        if (!(xValue instanceof Number x)
                || !(yValue instanceof Number y)
                || !Double.isFinite(x.doubleValue())
                || !Double.isFinite(y.doubleValue())
                || x.doubleValue() != Math.rint(x.doubleValue())
                || y.doubleValue() != Math.rint(y.doubleValue())) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：" + field + " 必须使用整数像素坐标"
            );
        }
        JSONObject normalized = new JSONObject();
        normalized.put("x", x.intValue());
        normalized.put("y", y.intValue());
        return normalized;
    }

    private static void validateLocalizedRegionOverlap(
            JSONArray regions,
            AiModelRunScene scene
    ) {
        for (int first = 0; first < regions.size(); first++) {
            JSONObject left = regions.getJSONObject(first);
            JSONObject leftTop = left.getJSONObject("topLeft");
            JSONObject leftBottom = left.getJSONObject("bottomRight");
            for (int second = first + 1; second < regions.size(); second++) {
                JSONObject right = regions.getJSONObject(second);
                JSONObject rightTop = right.getJSONObject("topLeft");
                JSONObject rightBottom = right.getJSONObject("bottomRight");
                double overlapWidth = Math.min(
                        leftBottom.getDoubleValue("x"),
                        rightBottom.getDoubleValue("x")
                ) - Math.max(leftTop.getDoubleValue("x"), rightTop.getDoubleValue("x"));
                double overlapHeight = Math.min(
                        leftBottom.getDoubleValue("y"),
                        rightBottom.getDoubleValue("y")
                ) - Math.max(leftTop.getDoubleValue("y"), rightTop.getDoubleValue("y"));
                if (overlapWidth > 0 && overlapHeight > 0) {
                    throw new IllegalArgumentException(
                            scene.getDisplayName() + "场景结果校验失败：坐标定位区域不能重叠："
                                    + left.getString("regionId") + "、" + right.getString("regionId")
                    );
                }
            }
        }
    }

    private static JSONObject validateEdgeReview(
            JSONObject region,
            String edgeName,
            double maximum,
            int regionIndex,
            AiModelRunScene scene
    ) {
        JSONObject edge = region.getJSONObject(edgeName);
        if (edge == null) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：regions[" + regionIndex + "]." + edgeName + " 必须是对象"
            );
        }
        requireOnlyKeys(
                edge,
                Set.of("action", "suggested", "reason"),
                scene.getDisplayName() + "场景结果校验失败：" + edgeName + " 包含额外字段"
        );
        String action = requireString(
                edge,
                "action",
                scene.getDisplayName() + "场景结果校验失败：" + edgeName + ".action 不能为空"
        );
        String reason = requireString(
                edge,
                "reason",
                scene.getDisplayName() + "场景结果校验失败：" + edgeName + ".reason 不能为空"
        );
        Object suggested = edge.get("suggested");
        if ("keep".equals(action)) {
            if (suggested != null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：keep 动作的 suggested 必须为 null"
                );
            }
        } else if ("move".equals(action)) {
            if (!(suggested instanceof Number number)
                    || !Double.isFinite(number.doubleValue())
                    || number.doubleValue() != Math.rint(number.doubleValue())
                    || number.doubleValue() < 0
                    || number.doubleValue() > maximum) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：move 动作必须提供范围内的整数像素 suggested"
                );
            }
        } else {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：action 只能是 keep 或 move"
            );
        }
        JSONObject normalized = new JSONObject();
        normalized.put("action", action);
        normalized.put("suggested", suggested);
        normalized.put("reason", reason);
        return normalized;
    }

    private static void validateOutlineGeometry(
            JSONArray reviews,
            JSONArray expectedRegions,
            double[] sourceSize,
            AiModelRunScene scene
    ) {
        JSONArray localized = new JSONArray();
        for (int index = 0; index < reviews.size(); index++) {
            JSONObject review = reviews.getJSONObject(index);
            JSONObject expected = expectedRegions.getJSONObject(index);
            JSONObject bounds = expected == null ? null : expected.getJSONObject("bounds");
            if (bounds == null) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景 validationContext.expectedRegions[" + index + "].bounds 不能为空"
                );
            }
            double left = resolveReviewedEdge(review.getJSONObject("left"), bounds, "left", scene);
            double top = resolveReviewedEdge(review.getJSONObject("top"), bounds, "top", scene);
            double right = resolveReviewedEdge(review.getJSONObject("right"), bounds, "right", scene);
            double bottom = resolveReviewedEdge(review.getJSONObject("bottom"), bounds, "bottom", scene);
            if (left < 0
                    || top < 0
                    || right > sourceSize[0]
                    || bottom > sourceSize[1]
                    || right <= left
                    || bottom <= top) {
                throw new IllegalArgumentException(
                        scene.getDisplayName() + "场景结果校验失败：微调后的区域像素边界无效或越界："
                                + review.getString("regionId")
                );
            }
            JSONObject item = new JSONObject();
            item.put("regionId", review.getString("regionId"));
            item.put("topLeft", Map.of("x", left, "y", top));
            item.put("bottomRight", Map.of("x", right, "y", bottom));
            localized.add(item);
        }
        validateLocalizedRegionOverlap(localized, scene);
    }

    private static double resolveReviewedEdge(
            JSONObject edge,
            JSONObject bounds,
            String edgeName,
            AiModelRunScene scene
    ) {
        if ("move".equals(edge.getString("action"))) {
            return edge.getDoubleValue("suggested");
        }
        Object value = bounds.get(edgeName);
        if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景 validationContext 中区域边界不合法：" + edgeName
            );
        }
        return number.doubleValue();
    }

    private static JSONObject parseObject(String reply, AiModelRunScene scene) {
        try {
            STRICT_JSON_MAPPER.readTree(reply);
            return JSON.parseObject(reply);
        } catch (Exception e) {
            throw new IllegalArgumentException(scene.getDisplayName() + "场景结果反序列化失败：" + sanitizeErrorMessage(e.getMessage()));
        }
    }

    private static JSONObject resolvePayload(JSONObject root) {
        JSONObject data = root.getJSONObject("data");
        return data != null ? data : root;
    }

    private static String normalizeRouteDecisionScene(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim().toLowerCase();
        if (normalized.isEmpty()) {
            return null;
        }

        if ("style-optimize".equals(normalized)
                || "style".equals(normalized)
                || "styleoptimize".equals(normalized)
                || "样式".equals(normalized)
                || "样式优化".equals(normalized)) {
            return "style-optimize";
        }

        if ("data-optimize".equals(normalized)
                || "data".equals(normalized)
                || "dataoptimize".equals(normalized)
                || "数据".equals(normalized)
                || "数据优化".equals(normalized)) {
            return "data-optimize";
        }

        if ("component-generate".equals(normalized)
                || "component generate".equals(normalized)
                || "componentgenerate".equals(normalized)
                || "component".equals(normalized)
                || "生成".equals(normalized)
                || "组件生成".equals(normalized)
                || "新建".equals(normalized)
                || "新增".equals(normalized)
                || "创建".equals(normalized)) {
            return "component-generate";
        }

        if ("component-replace".equals(normalized)
                || "component replace".equals(normalized)
                || "componentreplace".equals(normalized)
                || "replace".equals(normalized)
                || "replacecomponent".equals(normalized)
                || "组件替换".equals(normalized)
                || "替换".equals(normalized)
                || "替换成".equals(normalized)
                || "替换为".equals(normalized)
                || "换成".equals(normalized)
                || "换为".equals(normalized)
                || "改成".equals(normalized)
                || "改为".equals(normalized)) {
            return "component-replace";
        }

        if (normalized.contains("style-optimize")) {
            return "style-optimize";
        }
        if (normalized.contains("data-optimize")) {
            return "data-optimize";
        }
        if (normalized.contains("component-generate")
                || normalized.contains("componentgenerate")
                || normalized.contains("组件生成")
                || normalized.contains("生成")) {
            return "component-generate";
        }
        if (normalized.contains("component-replace")
                || normalized.contains("componentreplace")
                || normalized.contains("replace")
                || normalized.contains("组件替换")
                || normalized.contains("替换")
                || normalized.contains("换成")
                || normalized.contains("改成")) {
            return "component-replace";
        }

        return null;
    }

    private static String firstString(JSONObject object, String... keys) {
        Object value = firstValue(object, keys);
        return value instanceof String string ? string : null;
    }

    private static Object firstValue(JSONObject object, String... keys) {
        for (String key : keys) {
            if (object.containsKey(key)) {
                Object value = object.get(key);
                if (value != null) {
                    return value;
                }
            }
        }
        return null;
    }

    private static JSONArray firstArray(JSONObject object, String... keys) {
        for (String key : keys) {
            JSONArray array = object.getJSONArray(key);
            if (array != null) {
                return array;
            }
        }
        return null;
    }

    private static JSONObject firstObject(JSONObject object, String... keys) {
        for (String key : keys) {
            JSONObject value = object.getJSONObject(key);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String requireString(JSONObject object, String key, String message) {
        String value = trimToNull(object.getString(key));
        if (value == null) {
            throw new IllegalArgumentException(message);
        }
        return value;
    }

    private static String requireString(JSONObject object, String[] keys, String message) {
        String value = trimToNull(firstString(object, keys));
        if (value == null) {
            throw new IllegalArgumentException(message);
        }
        return value;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static void copyOptionalString(JSONObject source, JSONObject target, String... keys) {
        String value = trimToNull(firstString(source, keys));
        if (value != null) {
            target.put(keys[0], value);
        }
    }

    private static void putNumberIfPresent(JSONObject target, String key, Object value) {
        if (value instanceof Number number) {
            target.put(key, number);
        }
    }

    private static double requireFiniteNumber(
            JSONObject object,
            int index,
            AiModelRunScene scene,
            String... keys
    ) {
        Object value = firstValue(object, keys);
        if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：regions[" + index + "]." + keys[0] + " 必须是有限数字"
            );
        }
        return number.doubleValue();
    }

    private static double requirePositiveNumber(
            JSONObject object,
            int index,
            AiModelRunScene scene,
            String... keys
    ) {
        double value = requireFiniteNumber(object, index, scene, keys);
        if (value <= 0) {
            throw new IllegalArgumentException(
                    scene.getDisplayName() + "场景结果校验失败：regions[" + index + "]." + keys[0] + " 必须大于 0"
            );
        }
        return value;
    }

    private static String normalizeParentTempId(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String string) {
            String trimmed = string.trim();
            return trimmed.isEmpty() ? null : trimmed;
        }
        return String.valueOf(value);
    }

    private static String prettyPrint(JSONObject object) {
        return JSON.toJSONString(object, JSONWriter.Feature.PrettyFormat);
    }
}
