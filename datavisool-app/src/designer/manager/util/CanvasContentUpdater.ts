/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";
import {runInAction} from "mobx";
import {IdGenerate} from "@datavisool/sdk";
import {ObjectUtil} from "@datavisool/sdk";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController.ts";
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";
import {retryWithInterval} from "@/util/Tooles.ts";
import {normalizeLayerTransform} from "@/util/LayerTransformUtil.ts";
import {
    CanvasContentUpdateMode,
    ICanvasContentUpdatePayload,
    ICanvasContentUpdateResult,
    ILayerItem
} from "@datavisool/sdk/types";

export interface ICanvasContentManager {
    elemConfigs: Record<string, any> | null;
    controllers: Record<string, AbstractDesignerController>;
    layerConfigs: Record<string, ILayerItem>;
    layerHeader: string | undefined;
    layerTail: string | undefined;
    reRenderLayer: () => void;
}

interface IPreparedCanvasContent {
    /**
     * 标准化后的图层数据，key 为 updater 内部生成的 id。
     */
    layerMap: Record<string, ILayerItem>;
    /**
     * 标准化后的组件配置，key 与 layerMap 保持一致。
     */
    configMap: Record<string, any>;
    /**
     * 本批次最终写入画布的 id 列表，顺序与入参数组保持一致。
     */
    layerIds: string[];
    /**
     * 输入引用键到最终生成 id 的映射。
     */
    idMap: Record<string, string>;
    /**
     * 顶层链表的头指针。
     */
    rootHead?: string;
    /**
     * 顶层链表的尾指针。
     */
    rootTail?: string;
}

interface IPatchCanvasContentItem {
    targetId: string;
    layer: ILayerItem;
    config: any;
    configPatch?: any;
    sourceKeys: string[];
}

class CanvasContentUpdater {

    /**
     * 统一的画布更新入口。
     *
     * 工作流程：
     * 1. replace / append：按传入数组顺序生成新的图层 id，并重建批次内的链表关系；
     * 2. patch：仅更新画布中已存在图层的视觉属性，不调整链表关系；
     * 3. 触发重绘，并在需要时补全全局变量绑定。
     */
    public updateCanvasContent(
        layerManager: ICanvasContentManager,
        payloads: ICanvasContentUpdatePayload[],
        mode: CanvasContentUpdateMode = "replace"
    ): ICanvasContentUpdateResult {
        if (mode === "patch")
            return this.patchCanvasContent(layerManager, payloads);
        const prepared = this.prepareCanvasContent(payloads);
        if (mode === "replace")
            return this.replaceCanvasContent(layerManager, prepared);
        return this.appendCanvasContent(layerManager, prepared);
    }

    /**
     * 将外部传入的 payload 数组标准化为画布可直接消费的数据结构。
     *
     * 这里会做三件事：
     * 1. 统一生成新的图层 id；
     * 2. 把 config.base.id 改成新 id；
     * 3. 依据批次内引用键重建 pid / prev / next / childHeader / childTail；
     * 4. 生成顶层链表的头尾指针。
     */
    private prepareCanvasContent(payloads: ICanvasContentUpdatePayload[]): IPreparedCanvasContent {
        const sourcePayloads = Array.isArray(payloads) ? payloads : [];
        const layerMap: Record<string, ILayerItem> = {};
        const configMap: Record<string, any> = {};
        const layerIds: string[] = [];
        const idMap: Record<string, string> = {};
        const sourcePidMap: Record<string, string | undefined> = {};
        const usedSourceKeys = new Set<string>();
        const childGroupMap = new Map<string, string[]>();

        sourcePayloads.forEach((payload, index) => {
            if (!payload?.layer)
                return;
            const generatedId = IdGenerate.generateId();
            const sourceLayer = cloneDeep(payload?.layer ?? {}) as ILayerItem;
            const sourceConfig = payload?.config;
            const sourceKey = this.buildSourceKey(sourceLayer, index, usedSourceKeys);

            // id 完全由 updater 内部生成，外部传入的 id 不参与最终写入。
            idMap[sourceKey] = generatedId;

            sourceLayer.id = generatedId;
            sourceLayer.order = index + 1;
            sourcePidMap[generatedId] = sourceLayer.pid;
            // 这些关系字段都由 updater 统一重建，避免旧数据残留。
            sourceLayer.prev = undefined;
            sourceLayer.next = undefined;
            sourceLayer.pid = undefined;
            sourceLayer.childHeader = undefined;
            sourceLayer.childTail = undefined;
            sourceLayer.children = undefined;

            layerMap[generatedId] = sourceLayer;
            layerIds.push(generatedId);
            configMap[generatedId] = this.normalizeConfig(sourceConfig, sourceLayer, generatedId);
        });

        const rootIds: string[] = [];
        layerIds.forEach((id) => {
            const layer = layerMap[id];
            const rawPid = sourcePidMap[id];
            const resolvedPid = this.resolveSourceKey(rawPid, idMap);
            if (resolvedPid && layerMap[resolvedPid]) {
                layer.pid = resolvedPid;
                const childIds = childGroupMap.get(resolvedPid) ?? [];
                childIds.push(id);
                childGroupMap.set(resolvedPid, childIds);
            } else {
                if (rawPid) {
                    console.warn(`[CanvasContentUpdater] 图层 ${layer.name ?? id} 的 pid="${rawPid}" 无法在当前批次中解析，已按根节点处理。`);
                }
                layer.pid = undefined;
                rootIds.push(id);
            }
        });

        // 子链表先按批次顺序串起来，再把头尾指针写回父图层。
        childGroupMap.forEach((childIds, parentId) => {
            const parentLayer = layerMap[parentId];
            if (!parentLayer || childIds.length === 0)
                return;
            const {head, tail} = this.linkSequentialChain(childIds, layerMap);
            parentLayer.childHeader = head;
            parentLayer.childTail = tail;
        });

        // 顶层链表的顺序直接沿用入参数组顺序，外部只需要控制数组顺序即可。
        const {head: rootHead, tail: rootTail} = this.linkSequentialChain(rootIds, layerMap);

        return {
            layerMap,
            configMap,
            layerIds,
            idMap,
            rootHead,
            rootTail,
        };
    }

    /**
     * replace 模式：
     * 1. 清理旧 controller
     * 2. 解绑旧全局变量
     * 3. 用新批次整体覆盖画布状态
     */
    private replaceCanvasContent(
        layerManager: ICanvasContentManager,
        prepared: IPreparedCanvasContent
    ): ICanvasContentUpdateResult {
        const previousLayerIds = Object.keys(layerManager.layerConfigs ?? {});
        const previousControllers = Array.from(
            new Set(Object.values(layerManager.controllers ?? {}).filter(Boolean))
        );

        previousControllers.forEach((controller) => controller.destroy());
        if (previousLayerIds.length > 0)
            componentDataGvParser.unbindFromGv(previousLayerIds);

        runInAction(() => {
            layerManager.layerConfigs = prepared.layerMap;
            layerManager.elemConfigs = prepared.configMap;
            layerManager.layerHeader = prepared.rootHead;
            layerManager.layerTail = prepared.rootTail;
            layerManager.controllers = {};
        });

        layerManager.reRenderLayer();
        this.bindConfigAfterRender(layerManager, prepared.layerIds);

        return {
            layerIds: prepared.layerIds,
            idMap: prepared.idMap,
            removedLayerIds: previousLayerIds,
        };
    }

    /**
     * append 模式：
     * 1. 保留当前画布已有内容
     * 2. 把新批次接到当前链表前端
     * 3. 触发重绘并延迟绑定配置
     */
    private appendCanvasContent(
        layerManager: ICanvasContentManager,
        prepared: IPreparedCanvasContent
    ): ICanvasContentUpdateResult {
        if (prepared.layerIds.length === 0) {
            return {
                layerIds: [],
                idMap: {},
                removedLayerIds: [],
            };
        }

        const targetElemConfigs = layerManager.elemConfigs ?? {};
        layerManager.elemConfigs = targetElemConfigs;

        runInAction(() => {
            Object.assign(layerManager.layerConfigs, prepared.layerMap);
            Object.assign(targetElemConfigs, prepared.configMap);

            if (!layerManager.layerHeader) {
                // 当前画布为空时，追加批次直接成为整个画布。
                layerManager.layerHeader = prepared.rootHead;
                layerManager.layerTail = prepared.rootTail;
            } else if (prepared.rootHead && prepared.rootTail) {
                // 当前画布已有内容时，新批次插入到前端：
                // 新批次尾节点 -> 旧头节点
                const oldHeaderId = layerManager.layerHeader;
                const oldHeaderLayer = layerManager.layerConfigs[oldHeaderId];
                const batchTailLayer = layerManager.layerConfigs[prepared.rootTail];
                if (batchTailLayer)
                    batchTailLayer.next = oldHeaderId;
                if (oldHeaderLayer)
                    oldHeaderLayer.prev = prepared.rootTail;
                layerManager.layerHeader = prepared.rootHead;
            }

            if (!layerManager.layerTail)
                layerManager.layerTail = prepared.rootTail;
        });

        layerManager.reRenderLayer();
        this.bindConfigAfterRender(layerManager, prepared.layerIds);

        return {
            layerIds: prepared.layerIds,
            idMap: prepared.idMap,
            removedLayerIds: [],
        };
    }

    /**
     * patch 模式：
     * 1. 只处理已存在于画布中的图层 id；
     * 2. 如果传了 layer，则更新图层尺寸、位置等布局信息；
     * 3. 如果传了 config，则把 config patch 合并到当前组件配置；
     * 4. 保留原有链表引用关系，不新增、不重建。
     */
    private patchCanvasContent(
        layerManager: ICanvasContentManager,
        payloads: ICanvasContentUpdatePayload[]
    ): ICanvasContentUpdateResult {
        const sourcePayloads = Array.isArray(payloads) ? payloads : [];
        const patchItemMap = new Map<string, IPatchCanvasContentItem>();
        const idMap: Record<string, string> = {};
        const existingElemConfigs = layerManager.elemConfigs ?? {};
        layerManager.elemConfigs = existingElemConfigs;

        sourcePayloads.forEach((payload, index) => {
            const sourceLayer = payload?.layer ? cloneDeep(payload.layer) as ILayerItem : undefined;
            const sourceConfig = this.clonePlainObject(payload.config);
            if (!sourceLayer && !sourceConfig)
                return;

            const targetId = this.resolvePatchTargetId(layerManager, sourceLayer, sourceConfig);
            if (!targetId) {
                console.warn("[CanvasContentUpdater] patch 模式未找到可更新的图层 id，已跳过该条 payload。");
                return;
            }

            const existingLayer = layerManager.layerConfigs[targetId];
            if (!existingLayer) {
                console.warn(`[CanvasContentUpdater] patch 模式未找到图层 "${targetId}"，已跳过该条 payload。`);
                return;
            }

            const patchedLayer = sourceLayer
                ? this.buildPatchedLayer(existingLayer, sourceLayer, targetId)
                : cloneDeep(existingLayer);
            const patchedConfig = this.buildPatchedConfig(layerManager, targetId, sourceConfig);
            const configPatch = this.extractConfigPatch(sourceConfig, targetId);

            const previousItem = patchItemMap.get(targetId);
            patchItemMap.set(targetId, {
                targetId,
                layer: patchedLayer,
                config: patchedConfig,
                configPatch: previousItem?.configPatch
                    ? ObjectUtil.merge(cloneDeep(previousItem.configPatch), cloneDeep(configPatch ?? {}))
                    : configPatch,
                sourceKeys: Array.from(new Set([
                    ...(previousItem?.sourceKeys ?? []),
                    ...this.collectPatchSourceKeys(sourceLayer, sourceConfig, index),
                ])),
            });
        });

        const patchItems = Array.from(patchItemMap.values());
        if (patchItems.length === 0) {
            return {
                layerIds: [],
                idMap: {},
                removedLayerIds: [],
            };
        }

        patchItems.forEach((item) => {
            item.sourceKeys.forEach((key) => {
                idMap[key] = item.targetId;
            });
        });

        runInAction(() => {
            patchItems.forEach((item) => {
                layerManager.layerConfigs[item.targetId] = item.layer;
                existingElemConfigs[item.targetId] = item.config;
            });
        });

        const updatedControllers = new Set<AbstractDesignerController>();
        patchItems.forEach((item) => {
            const controller = layerManager.controllers[item.targetId];
            if (!controller || updatedControllers.has(controller))
                return;

            if (item.configPatch && Object.keys(item.configPatch).length > 0) {
                controller.update(cloneDeep(item.configPatch) as any, {reRender: true});
            }

            const currentConfig = controller.getConfig();
            if (currentConfig)
                existingElemConfigs[item.targetId] = cloneDeep(currentConfig);

            updatedControllers.add(controller);
        });

        layerManager.reRenderLayer();

        return {
            layerIds: patchItems.map((item) => item.targetId),
            idMap,
            removedLayerIds: [],
        };
    }

    /**
     * 统一生成 payload 的“批次内引用键”。
     *
     * - 优先使用 layer.id，便于手动构建 group / 子组件关系；
     * - 如果没有 layer.id，则回退到数组下标；
     * - 如果出现重复键，会自动追加后缀避免覆盖。
     */
    private buildSourceKey(layer: ILayerItem, index: number, usedSourceKeys: Set<string>): string {
        const rawKey = typeof layer?.id === "string" && layer.id.trim() ? layer.id.trim() : `${index}`;
        if (!usedSourceKeys.has(rawKey)) {
            usedSourceKeys.add(rawKey);
            return rawKey;
        }

        let suffix = 1;
        let key = `${rawKey}_${suffix}`;
        while (usedSourceKeys.has(key)) {
            suffix += 1;
            key = `${rawKey}_${suffix}`;
        }
        usedSourceKeys.add(key);
        console.warn(`[CanvasContentUpdater] 检测到重复的批次内引用键 "${rawKey}"，已自动重命名为 "${key}"。`);
        return key;
    }

    /**
     * 仅保留 patch 模式需要写回的图层字段。
     */
    private buildPatchedLayer(existingLayer: ILayerItem, sourceLayer: ILayerItem, targetId: string): ILayerItem {
        const nextLayer = cloneDeep(existingLayer);

        if (sourceLayer.width !== undefined)
            nextLayer.width = sourceLayer.width;
        if (sourceLayer.height !== undefined)
            nextLayer.height = sourceLayer.height;
        if (sourceLayer.x !== undefined)
            nextLayer.x = sourceLayer.x;
        if (sourceLayer.y !== undefined)
            nextLayer.y = sourceLayer.y;
        if (sourceLayer.rotate !== undefined)
            nextLayer.rotate = sourceLayer.rotate;
        if (sourceLayer.transform != null)
            nextLayer.transform = normalizeLayerTransform({
                ...(nextLayer.transform ?? {}),
                ...(sourceLayer.transform ?? {}),
            });
        if (sourceLayer.hide !== undefined)
            nextLayer.hide = sourceLayer.hide;
        if (sourceLayer.lock !== undefined)
            nextLayer.lock = sourceLayer.lock;

        nextLayer.id = targetId;
        return nextLayer;
    }

    /**
     * patch 模式下将 config patch 合并进当前配置，并强制修正 base.id。
     */
    private buildPatchedConfig(
        layerManager: ICanvasContentManager,
        targetId: string,
        sourceConfig?: any
    ): any {
        const currentConfig = layerManager.controllers[targetId]?.getConfig()
            ?? layerManager.elemConfigs?.[targetId]
            ?? {base: {id: targetId}};
        const nextConfig = cloneDeep(currentConfig ?? {base: {id: targetId}});
        if (sourceConfig)
            ObjectUtil.merge(nextConfig, cloneDeep(sourceConfig));

        if (!nextConfig.base || typeof nextConfig.base !== "object" || Array.isArray(nextConfig.base))
            nextConfig.base = {};
        nextConfig.base.id = targetId;

        return nextConfig;
    }

    /**
     * patch 模式的目标 id 优先使用 layer.id，其次使用 config.base.id。
     */
    private resolvePatchTargetId(
        layerManager: ICanvasContentManager,
        layer?: ILayerItem,
        config?: any
    ): string | undefined {
        const layerId = this.normalizeCandidateId(layer?.id);
        if (layerId && layerManager.layerConfigs[layerId])
            return layerId;

        const configId = this.normalizeCandidateId(config?.base?.id);
        if (configId && layerManager.layerConfigs[configId])
            return configId;

        return undefined;
    }

    /**
     * 将 payload 中可用的 source key 收集起来，方便调用方映射回原始 id。
     */
    private collectPatchSourceKeys(layer: ILayerItem | undefined, config: any, index: number): string[] {
        const keys = new Set<string>();
        const layerId = this.normalizeCandidateId(layer?.id);
        const configId = this.normalizeCandidateId(config?.base?.id);

        if (layerId)
            keys.add(layerId);
        if (configId)
            keys.add(configId);
        if (keys.size === 0)
            keys.add(`${index}`);

        return Array.from(keys);
    }

    /**
     * 生成需要传给 controller.update 的配置 patch。
     */
    private extractConfigPatch(config: any, targetId: string): any {
        if (!config || typeof config !== "object" || Array.isArray(config))
            return undefined;
        const nextConfig = cloneDeep(config);
        if (!nextConfig.base || typeof nextConfig.base !== "object" || Array.isArray(nextConfig.base))
            nextConfig.base = {};
        nextConfig.base.id = targetId;
        return nextConfig;
    }

    private clonePlainObject(value: any): any {
        if (!value || typeof value !== "object" || Array.isArray(value))
            return undefined;
        return cloneDeep(value);
    }

    private normalizeCandidateId(value: unknown): string | undefined {
        if (typeof value !== "string")
            return undefined;
        const normalized = value.trim();
        return normalized ? normalized : undefined;
    }

    /**
     * 处理 config 数据，保证最终一定存在可渲染的 base.id / base.type / base.name。
     */
    private normalizeConfig(sourceConfig: any, sourceLayer: ILayerItem, generatedId: string): any {
        const isPlainObject = sourceConfig && typeof sourceConfig === "object" && !Array.isArray(sourceConfig);
        const clonedConfig = isPlainObject ? cloneDeep(sourceConfig) : {};
        const base = isPlainObject && clonedConfig.base && typeof clonedConfig.base === "object" && !Array.isArray(clonedConfig.base)
            ? clonedConfig.base
            : {};
        const normalizedBase = {
            ...base,
            id: generatedId,
            type: base.type ?? sourceLayer.type ?? "",
            name: base.name ?? sourceLayer.name ?? sourceLayer.type ?? "",
        };
        if (isPlainObject) {
            clonedConfig.base = normalizedBase;
            return clonedConfig;
        }
        return {base: normalizedBase};
    }

    /**
     * 把批次内引用键映射回 updater 内部生成的 id。
     * 只处理当前批次内能解析到的引用，解析不到的父子关系会被视为根节点。
     */
    private resolveSourceKey(reference: string | undefined, idMap: Record<string, string>): string | undefined {
        if (!reference)
            return undefined;
        return idMap[reference];
    }

    /**
     * 按输入数组顺序串起一条双向链表，并返回链表头尾。
     */
    private linkSequentialChain(layerIds: string[], layerMap: Record<string, ILayerItem>) {
        if (!layerIds || layerIds.length === 0)
            return {head: undefined as string | undefined, tail: undefined as string | undefined};

        layerIds.forEach((id, index) => {
            const layer = layerMap[id];
            if (!layer)
                return;
            layer.prev = layerIds[index - 1];
            layer.next = layerIds[index + 1];
        });

        return {
            head: layerIds[0],
            tail: layerIds[layerIds.length - 1],
        };
    }

    /**
     * 等待 React 组件真正挂载完成后，再补全全局变量绑定。
     *
     * 组件 controller 不是在数据写入那一刻立刻存在，而是在下一轮渲染后才会注册到 layerManager.controllers。
     * 所以这里用重试机制等待 controller 可用，再执行 bindConfigToGvById。
     */
    private bindConfigAfterRender(layerManager: ICanvasContentManager, layerIds: string[]) {
        if (!layerIds || layerIds.length === 0)
            return;

        void retryWithInterval(() => {
            return layerIds.every((id) => !!layerManager.controllers[id]);
        }, 50, 20).then((success) => {
            if (success)
                componentDataGvParser.bindConfigToGvById(layerIds);
            else
                console.warn("[CanvasContentUpdater] 等待组件控制器挂载超时，已跳过全局变量绑定。");
        });
    }
}

const canvasContentUpdater = new CanvasContentUpdater();
window.canvasContentUpdater = canvasContentUpdater;
export default canvasContentUpdater;
