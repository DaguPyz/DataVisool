/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import {expandSelectionTreeIds} from "@/designer/operate-provider/selection/SelectionPolicy.ts";

interface CurrentSelectionResult {
    mode: "none" | "single" | "multiple";
    targetIds: string[];
    components: Array<{
        id: string;
        type: string;
        name?: string;
        layer: unknown;
    }>;
    totalSelected: number;
    truncated: boolean;
}

const MAX_SELECTION_COMPONENTS = 100;

/** 读取调用时刻真实选区，过滤仅用于组织的 group 图层。 */
export function runGetCurrentCanvasSelectionTool(): CurrentSelectionResult {
    const layers = window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs ?? {};
    const targetIds = expandSelectionTreeIds(eventOperateStore.targetIds ?? [], layers)
        .filter((id) => typeof layers[id]?.type === "string" && layers[id]?.type !== "group");
    const components = targetIds.slice(0, MAX_SELECTION_COMPONENTS).map((id) => {
        const layer = layers[id]!;
        return {
            id,
            type: layer.type!,
            name: typeof layer.name === "string" && layer.name.trim() ? layer.name : undefined,
            layer: {
                id: layer.id,
                type: layer.type,
                name: layer.name,
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height,
                order: layer.order,
            },
        };
    });
    return {
        mode: components.length === 0 ? "none" : components.length === 1 ? "single" : "multiple",
        targetIds: components.map((component) => component.id),
        components,
        totalSelected: targetIds.length,
        truncated: targetIds.length > MAX_SELECTION_COMPONENTS,
    };
}
