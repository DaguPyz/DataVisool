/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";

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
export function runGetCurrentCanvasSelectionTool(session: EditorAiEditingSession): CurrentSelectionResult {
    const canvas = session.readCanvas();
    const selection = session.readSelection();
    const byId = new Map(canvas.components.map(component => [component.id, component]));
    const children = new Map<string, string[]>();
    canvas.components.forEach(component => {
        const parentId = typeof component.layer.pid === "string" ? component.layer.pid : "";
        if (!parentId || byId.get(parentId)?.type !== "group") return;
        const list = children.get(parentId) ?? [];
        list.push(component.id);
        children.set(parentId, list);
    });
    const expanded: string[] = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
        const item = byId.get(id);
        if (!item || visited.has(id)) return;
        visited.add(id);
        expanded.push(id);
        if (item.type === "group") (children.get(id) ?? []).forEach(visit);
    };
    selection.ids.forEach(visit);
    const targetIds = expanded.filter(id => byId.get(id)?.type !== "group");
    const components = targetIds.slice(0, MAX_SELECTION_COMPONENTS).map((id) => {
        const layer = byId.get(id)!.layer;
        return {
            id,
            type: typeof layer.type === "string" ? layer.type : "unknown",
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
