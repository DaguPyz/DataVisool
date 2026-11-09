/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import java.util.Locale;

public enum AiModelRunScene {
    STYLE_OPTIMIZE("style-optimize", "样式优化"),
    DATA_OPTIMIZE("data-optimize", "数据优化"),
    ROUTE_DECISION("route-decision", "AI融合路由判断"),
    WORKFLOW_PLAN("workflow-plan", "AI 工作流规划"),
    COMPONENT_SELECT("component-select", "组件选择"),
    COMPONENT_LAYOUT("component-layout", "布局规划"),
    COMPONENT_GENERATE("component-generate", "组件生成"),
    COMPONENT_REPLACE("component-replace", "组件替换"),
    REFERENCE_CONTENT_PARTITION("reference-content-partition", "参考图内容分区"),
    REFERENCE_COORDINATE_LOCALIZATION("reference-coordinate-localization", "参考图坐标定位"),
    REFERENCE_OUTLINE_REFINEMENT("reference-outline-refinement", "参考图线框微调"),
    REFERENCE_REGION_DETECT("reference-region-detect", "参考图区域识别"),
    REFERENCE_BOUNDARY_REVIEW("reference-boundary-review", "参考图边界复审"),
    REGION_COMPONENT_AUDIT("region-component-audit", "区域组件视觉复核"),
    REGION_STYLE_PATCH("region-style-patch", "区域样式补丁"),
    REGION_DATA_PATCH("region-data-patch", "区域数据补丁");

    private final String value;
    private final String displayName;

    AiModelRunScene(String value, String displayName) {
        this.value = value;
        this.displayName = displayName;
    }

    public String asString() {
        return value;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static AiModelRunScene fromValue(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return null;
        }

        return switch (normalized) {
            case "style-optimize", "style", "styleoptimize", "样式", "样式优化" -> STYLE_OPTIMIZE;
            case "data-optimize", "data", "dataoptimize", "数据", "数据优化" -> DATA_OPTIMIZE;
            case "route-decision", "route decision", "routedecision", "route", "路由", "路由判断", "ai融合路由判断" ->
                    ROUTE_DECISION;
            case "workflow-plan", "workflow plan", "workflowplan", "工作流规划", "任务规划" ->
                    WORKFLOW_PLAN;
            case "component-select", "component select", "componentselect", "select", "组件选择" ->
                    COMPONENT_SELECT;
            case "component-layout", "component layout", "componentlayout", "layout", "布局", "布局规划" ->
                    COMPONENT_LAYOUT;
            case "component-generate", "component generate", "componentgenerate", "component", "生成", "组件生成", "新建", "新增", "创建" ->
                    COMPONENT_GENERATE;
            case "component-replace", "component replace", "componentreplace", "replace", "组件替换", "替换" ->
                    COMPONENT_REPLACE;
            case "reference-content-partition", "reference content partition", "content-partition", "内容分区" ->
                    REFERENCE_CONTENT_PARTITION;
            case "reference-coordinate-localization", "reference coordinate localization", "coordinate-localization", "坐标定位" ->
                    REFERENCE_COORDINATE_LOCALIZATION;
            case "reference-outline-refinement", "reference outline refinement", "outline-refinement", "线框微调" ->
                    REFERENCE_OUTLINE_REFINEMENT;
            case "reference-region-detect", "reference region detect", "region-detect", "区域识别" ->
                    REFERENCE_REGION_DETECT;
            case "reference-boundary-review", "reference boundary review", "boundary-review", "边界复审" ->
                    REFERENCE_BOUNDARY_REVIEW;
            case "region-component-audit", "region component audit", "component-audit", "组件视觉复核" ->
                    REGION_COMPONENT_AUDIT;
            case "region-style-patch", "region style patch", "区域样式补丁" ->
                    REGION_STYLE_PATCH;
            case "region-data-patch", "region data patch", "区域数据补丁" ->
                    REGION_DATA_PATCH;
            default -> null;
        };
    }
}
