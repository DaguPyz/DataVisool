/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {canvasRevision} from "@/frontend-effect/CanvasOperationJournal.ts";
import {runGetCurrentCanvasSelectionTool} from "@/frontend-effect/tools/GetCurrentCanvasSelectionTool.ts";

interface CanvasLayerSummary {
    id: string;
    type?: string;
    name?: string;
    pid?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    order?: number;
}

/** 读取当前浏览器画布的轻量项目上下文。 */
export function runGetProjectSnapshotTool() {
    const manager = window.DATAVISOOL_ENV?.currentManager;
    const canvasConfig = manager?.canvasManager?.canvasConfig ?? {};
    const components = readLayerSummaries(manager?.layerManager?.layerConfigs);
    const revision = canvasRevision(components);
    return {
        projectId: window.DATAVISOOL_ENV?.projectId ?? "",
        managerId: manager?.id ?? "",
        canvasSnapshot: {
            width: finiteNumber(canvasConfig.width),
            height: finiteNumber(canvasConfig.height),
            managerId: manager?.id ?? "",
        },
        revision,
        components,
        selection: runGetCurrentCanvasSelectionTool(),
    };
}

/** 返回与桌面端一致的字符串画布 revision，不使用服务端缓存版本号。 */
export function runGetCurrentCanvasRevisionTool() {
    const manager = window.DATAVISOOL_ENV?.currentManager;
    const components = readLayerSummaries(manager?.layerManager?.layerConfigs);
    return {
        revision: canvasRevision(components),
        managerId: manager?.id ?? "",
        componentCount: components.length,
    };
}

function readLayerSummaries(value: unknown): CanvasLayerSummary[] {
    if (!isRecord(value))
        return [];
    return Object.values(value)
        .filter(isRecord)
        .map((layer) => ({
            id: text(layer.id),
            type: textOrUndefined(layer.type),
            name: textOrUndefined(layer.name),
            pid: textOrUndefined(layer.pid),
            x: finiteOptional(layer.x),
            y: finiteOptional(layer.y),
            width: finiteOptional(layer.width),
            height: finiteOptional(layer.height),
            order: finiteOptional(layer.order),
        }))
        .filter((layer) => Boolean(layer.id))
        .sort((left, right) => left.id.localeCompare(right.id));
}

function finiteNumber(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

function finiteOptional(value: unknown): number | undefined {
    const result = Number(value);
    return Number.isFinite(result) ? result : undefined;
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function textOrUndefined(value: unknown): string | undefined {
    const result = text(value);
    return result || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
