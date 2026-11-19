/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IAddOperateData, IDelOperateData, IGraphicalTransform, IHideOperateData, IHistoryRecord, IHistoryRecords, ILockOperateData, IUpdLayerOperateData, IUpdStyleOperateData, IUpdStyleStatusOperateData, OperateType} from "./OperateType";
import type {EventOperateStore} from "../state/EventOperateStore.ts";
import type HistoryOperator from "./HistoryOperator.ts";
import type {DesignerEditingScene} from "@datavisool/sdk/plugin/contracts/designerRuntime";
import type {DesignerSceneLayerSnapshot} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import {runInAction} from "mobx";
import {cloneDeep, isEqual} from "lodash";
import {ConfigureObjectFragments} from "@datavisool/sdk";
import {IdGenerate} from "@datavisool/sdk";
import LayerUtil from "@/plugins/editor-canvas/layers/LayerUtil";
import LayerRepairUtil from '@/plugins/editor-canvas/layers/LayerRepairUtil.ts';
import {ILayerItem} from "@datavisool/sdk/types";
import CoordinateUtil from "@/plugins/editor-canvas/layers/CoordinateUtil.ts";
import {normalizeLayerTransform} from "@/util/LayerTransformUtil.ts";
import {createLegacyCanvasModelAdapter, type LegacyCanvasManagerFacade} from './LegacyCanvasModelAdapter.ts';
import {recordSceneModelChange, rollbackUnrecordedSceneModelChange} from '../state/SceneModelChangeGuard.ts';

type LayerDragPosition = 'before' | 'after';


export interface UseTemplateOperateResult {
    appliedLayerIds: string[];
    layerIdMap: Record<string, string>;
}

export interface HistoryRecordOperateProxyOptions {
    readonly eventOperateStore: EventOperateStore;
    readonly history: HistoryOperator;
    readScene(): DesignerEditingScene | undefined;
    isActive(): boolean;
}

interface LegacyCanvasTransaction {
    readonly scene: DesignerEditingScene;
    readonly before: DesignerSceneLayerSnapshot;
    readonly adapter: ReturnType<typeof createLegacyCanvasModelAdapter>;
    readonly records: IHistoryRecords[];
    readonly changes: SceneModelChange[];
}

export class HistoryRecordOperateProxy {
    private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();
    private transaction: LegacyCanvasTransaction | undefined;

    constructor(private readonly options: HistoryRecordOperateProxyOptions) {
        return new Proxy(this, {
            get: (target, property, receiver) => {
                const value = Reflect.get(target, property, receiver);
                if (typeof value !== 'function' || property === 'constructor' || property === 'dispose' || property === 'pause') return value;
                return (...args: unknown[]) => {
                    if (!target.options.isActive()) {
                        return target.inactiveResult(property);
                    }
                    if (target.transaction) return value.apply(receiver, args);
                    return target.runTransaction(() => value.apply(receiver, args), property);
                };
            },
        });
    }

    private inactiveResult(method: PropertyKey): unknown {
        if (method === 'doClone') return [];
        if (method === 'doLayerRename') return false;
        if (method === 'doReplaceComponent') return null;
        if (method === 'doUseTemplate') return {appliedLayerIds: [], layerIdMap: {}};
        return undefined;
    }

    private readLegacyModel(): LegacyCanvasManagerFacade | undefined {
        return this.transaction?.adapter.manager;
    }

    private captureHistory(record: IHistoryRecords, change?: SceneModelChange): void {
        if (!this.transaction) {
            this.options.history.put(record, change);
            return;
        }
        this.transaction.records.push(record);
        this.trackSceneChange(change);
    }

    /** Tracks an already-applied owner change so an exception inside the legacy operation can revert it. */
    private trackSceneChange(change?: SceneModelChange): void {
        if (!change || !this.transaction || this.transaction.changes.includes(change)) return;
        this.transaction.changes.push(change);
    }

    private combineChanges(changes: readonly SceneModelChange[]): SceneModelChange | undefined {
        if (changes.length === 0) return undefined;
        if (changes.length === 1) return changes[0];
        const sceneVersion = changes[0].sceneVersion;
        const sceneIdentity = changes[0].sceneIdentity;
        if (!sceneIdentity || changes.some(change => change.sceneVersion !== sceneVersion || change.sceneIdentity !== sceneIdentity)) return undefined;
        const pageIds = Object.freeze([...new Set(changes.flatMap(change => change.pageIds))]);
        return Object.freeze({
            sceneIdentity,
            sceneVersion,
            pageIds,
            rollback() {
                const rolledBack: SceneModelChange[] = [];
                for (let index = changes.length - 1; index >= 0; index--) {
                    const change = changes[index];
                    if (!change.rollback()) {
                        rolledBack.reverse().forEach(item => item.redo());
                        return false;
                    }
                    rolledBack.push(change);
                }
                return true;
            },
            undo() {
                const undone: SceneModelChange[] = [];
                for (let index = changes.length - 1; index >= 0; index--) {
                    const change = changes[index];
                    if (!change.undo()) {
                        undone.reverse().forEach(item => item.redo());
                        return false;
                    }
                    undone.push(change);
                }
                return true;
            },
            redo() {
                const redone: SceneModelChange[] = [];
                for (const change of changes) {
                    if (!change.redo()) {
                        redone.reverse().forEach(item => item.undo());
                        return false;
                    }
                    redone.push(change);
                }
                return true;
            },
        });
    }

    private runTransaction<T>(run: () => T, method: PropertyKey): T {
        const scene = this.options.readScene();
        const before = scene?.layers.read();
        if (!scene || !scene.identity || !before || before.sceneIdentity !== scene.identity
            || before.sceneVersion !== scene.version || !scene.isActive()) return this.inactiveResult(method) as T;
        const adapter = createLegacyCanvasModelAdapter(before);
        const transaction: LegacyCanvasTransaction = {scene, before, adapter, records: [], changes: []};
        this.transaction = transaction;
        let result: T;
        try {
            result = run();
        } catch (error) {
            this.transaction = undefined;
            const rollbackErrors: unknown[] = [];
            for (let index = transaction.changes.length - 1; index >= 0; index--) {
                try { rollbackUnrecordedSceneModelChange(transaction.changes[index]); }
                catch (rollbackError) { rollbackErrors.push(rollbackError); }
            }
            if (rollbackErrors.length)
                throw new AggregateError([error, ...rollbackErrors], '画布事务失败且场景变更未能完整回滚。');
            throw error;
        }
        this.transaction = undefined;
        const rollbackChanges = (changes: readonly SceneModelChange[]) => {
            const errors: unknown[] = [];
            for (let index = changes.length - 1; index >= 0; index--) {
                try { rollbackUnrecordedSceneModelChange(changes[index]); }
                catch (error) { errors.push(error); }
            }
            if (errors.length) throw new AggregateError(errors, '画布事务变更回滚失败。');
        };
        if (transaction.records.length === 0) {
            rollbackChanges(transaction.changes);
            return result;
        }
        if (!this.options.isActive() || this.options.readScene() !== scene || !scene.isActive()) {
            rollbackChanges(transaction.changes);
            return this.inactiveResult(method) as T;
        }

        const next = transaction.adapter.readSnapshot();
        const {sceneVersion: _sceneVersion, ...nextModel} = next;
        const layerChange = scene.layers.replace(before, nextModel);
        const {sceneVersion: _beforeSceneVersion, ...beforeModel} = before;
        if (!layerChange && !isEqual(beforeModel, nextModel)) {
            rollbackChanges(transaction.changes);
            return this.inactiveResult(method) as T;
        }
        const changes = [
            ...transaction.changes,
            ...(layerChange ? [layerChange] : []),
        ];
        const change = this.combineChanges(changes);
        if (!change) {
            rollbackChanges(changes);
            return this.inactiveResult(method) as T;
        }
        if (!scene.identity || !change.sceneIdentity || change.sceneIdentity !== scene.identity || change.sceneVersion !== scene.version) {
            rollbackUnrecordedSceneModelChange(change);
            return this.inactiveResult(method) as T;
        }
        if (!recordSceneModelChange(change, item => this.options.history.recordChange(item)))
            return this.inactiveResult(method) as T;
        return result;
    }

    private afterCurrentScene(callback: () => void): void {
        const scene = this.options.readScene();
        if (!this.options.isActive() || !scene || !scene.isActive()) return;
        Promise.resolve().then(() => {
            if (this.options.isActive() && scene.isActive() && this.options.readScene() === scene) callback();
        });
    }

    private currentSceneVersion(): number {
        return this.options.readScene()?.version ?? -1;
    }

    public pause(): void {
        for (const timer of this.pendingTimers) clearTimeout(timer);
        this.pendingTimers.clear();
    }

    public dispose(): void { this.pause(); }


    /**
     * 修复根链表的头尾锚点。
     * 某些历史回滚或异常中断后，layerHeader / layerTail 可能还保留旧 id，
     * 但对应图层已经不在 layerConfigs 中了。这里优先保留有效锚点，
     * 无效时再从当前顶层图层里推导出一个可继续插入的头尾节点。
     */
    private resolveValidRootAnchors(layerManager: any, layerConfigs: Record<string, ILayerItem>) {
        const topLevelLayers = Object.values(layerConfigs ?? {}).filter((layer) => !layer?.pid);
        const currentHeaderId = typeof layerManager?.layerHeader === "string" ? layerManager.layerHeader : undefined;
        const currentTailId = typeof layerManager?.layerTail === "string" ? layerManager.layerTail : undefined;

        // 优先使用没有 prev / next 的真实边界节点；如果链表本身已不完整，则回退到 order 推导。
        const fallbackHeaderId = topLevelLayers.find((layer) => !layer?.prev)?.id
            ?? [...topLevelLayers].sort((prev, next) => (next.order ?? 0) - (prev.order ?? 0))[0]?.id;
        const fallbackTailId = topLevelLayers.find((layer) => !layer?.next)?.id
            ?? [...topLevelLayers].sort((prev, next) => (prev.order ?? 0) - (next.order ?? 0))[0]?.id;

        return {
            headerId: currentHeaderId && layerConfigs[currentHeaderId] ? currentHeaderId : fallbackHeaderId,
            tailId: currentTailId && layerConfigs[currentTailId] ? currentTailId : fallbackTailId,
        };
    }

    private snapshotLayerForRepair(layer: ILayerItem): IUpdLayerOperateData {
        return {
            id: layer.id,
            name: layer.name,
            type: layer.type,
            width: layer.width,
            height: layer.height,
            x: layer.x,
            y: layer.y,
            rotate: layer.rotate,
            transform: cloneDeep(layer.transform),
            hide: layer.hide,
            lock: layer.lock,
            order: layer.order,
            pid: layer.pid,
            childHeader: layer.childHeader,
            childTail: layer.childTail,
            prev: layer.prev,
            next: layer.next,
        };
    }

    public doDrag(latestState: ILayerItem[]): void {
        //构建历史记录数据
        const {layerConfigs, updateLayer} = this.readLegacyModel()!.layerManager!;

        //1. 记录变更前数据
        const prev = latestState.map((item) => {
            const {id, x = 0, y = 0, rotate = 0} = layerConfigs[item.id!];
            return {id, x, y, rotate}
        })

        //2. 更新布局数据
        updateLayer(latestState, false);

        //3. 记录变更后数据
        const next = latestState.map((item) => {
            const {id, x = 0, y = 0, rotate = 0} = layerConfigs[item.id!];
            return {id, x, y, rotate}
        })

        //4. 构建历史记录节点
        const data: IHistoryRecord = {
            type: OperateType.DRAG,
            prev: prev!,
            next: next!
        }

        //历史记录入队
        this.captureHistory({actions: [data]});
    }

    public doRotate(latestState: ILayerItem[]): void {
        if (!latestState || latestState.length === 0)
            return;
        const {layerConfigs, updateLayer} = this.readLegacyModel()!.layerManager!;

        //1. 记录变更前数据
        const prev = latestState.map((item) => {
            const {id, x = 0, y = 0, rotate = 0} = layerConfigs[item.id!];
            return {id: id!, x: x!, y: y!, rotate: rotate!}
        })

        //2. 执行数据变更
        updateLayer(latestState, false);

        //3. 记录变更后数据
        const next = latestState.map((item) => {
            const {id, x = 0, y = 0, rotate = 0} = layerConfigs[item.id!];
            return {id: id!, x: x!, y: y!, rotate: rotate!}
        })

        //4. 构建历史记录节点
        const data: IHistoryRecord = {
            type: OperateType.ROTATE,
            prev: prev!,
            next: next!
        }

        //5. 历史记录入队
        this.captureHistory({actions: [data]});
    }

    public doTransform(latestState: ILayerItem[]): void {
        if (!latestState || latestState.length === 0)
            return;
        const {layerConfigs, updateLayer} = this.readLegacyModel()!.layerManager!;

        const resolvedItems = latestState
            .map((item) => {
                const currentLayer = layerConfigs[item.id!];
                if (!currentLayer)
                    return null;
                return {
                    id: item.id!,
                    currentLayer,
                    nextTransform: normalizeLayerTransform({
                        ...(currentLayer.transform ?? {}),
                        ...(item.transform ?? {}),
                    }),
                };
            })
            .filter((item): item is {
                id: string;
                currentLayer: ILayerItem;
                nextTransform: ReturnType<typeof normalizeLayerTransform>;
            } => !!item);

        if (resolvedItems.length === 0)
            return;

        const prev = resolvedItems.map((item) => ({
            id: item.id,
            transform: normalizeLayerTransform(item.currentLayer.transform),
        }));

        updateLayer(resolvedItems.map((item) => ({
            id: item.id,
            transform: item.nextTransform,
        })), true);

        const next = resolvedItems.map((item) => ({
            id: item.id,
            transform: normalizeLayerTransform(layerConfigs[item.id!]?.transform),
        }));

        next.forEach((item) => {
            const currentLayer = layerConfigs[item.id];
            if (currentLayer)
                this.options.eventOperateStore.emitInspectorChange({kind: 'layers-updated', layers: [currentLayer]});
        });

        const data: IHistoryRecord = {
            type: OperateType.TRANSFORM,
            prev: prev!,
            next: next!
        };

        this.captureHistory({actions: [data]});
    }

    public doResize(latestState: ILayerItem[]): void {
        //构建历史记录数据
        const {layerConfigs, updateLayer} = this.readLegacyModel()!.layerManager!;

        //1. 记录变更前数据
        const prev: IGraphicalTransform[] = latestState.map((item) => {
            const {id, x = 0, y = 0, width = 0, height = 0, rotate = 0} = layerConfigs[item.id!];
            return {id: id!, x, y, width, height, rotate}
        })

        //2. 更新布局数据
        updateLayer(latestState, true);

        //3. 记录变更后数据
        const next: IGraphicalTransform[] = latestState.map((item) => {
            const {id, x = 0, y = 0, width = 0, height = 0, rotate = 0} = layerConfigs[item.id!];
            return {id: id!, x, y, width, height, rotate}
        })

        //4. 构建历史记录节点
        const record: IHistoryRecord = {type: OperateType.RESIZE, prev: prev!, next: next!}

        //5. 历史记录入队
        this.captureHistory({actions: [record]});
    }

    public doAdd(layer: ILayerItem, initialConfig?: Record<string, any>): void {
        const addPrev: IAddOperateData[] = [];
        const addNext: IAddOperateData[] = [];
        const updLayerPrev: IUpdLayerOperateData[] = [];
        const updLayerNext: IUpdLayerOperateData[] = [];
        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs, updateLayer} = layerManager!;
        const {headerId: currentHeaderId, tailId: currentTailId} = this.resolveValidRootAnchors(layerManager, layerConfigs);

        //头插法建立双向链表
        if (!currentHeaderId) {
            //首次插入
            addPrev.push({layerHeader: currentHeaderId, layerTail: currentTailId})
            layerManager!.layerHeader = layer.id;
            layerManager!.layerTail = layer.id;
        } else {
            //非首次插入
            addPrev.push({layerHeader: currentHeaderId, layerTail: currentTailId})
            const oldHeaderLayer = layerConfigs[currentHeaderId];
            updLayerPrev.push({id: oldHeaderLayer.id, prev: oldHeaderLayer.prev})
            oldHeaderLayer.prev = layer.id;
            layer.next = oldHeaderLayer.id;
            layerManager.layerHeader = layer.id;
            layerManager.layerTail = currentTailId ?? oldHeaderLayer.id;
            updLayerNext.push({id: oldHeaderLayer.id, prev: layer.id})
        }
        addNext.push({
            id: layer.id,
            layerConfig: cloneDeep(layer),
            ...(initialConfig ? {elemConfig: cloneDeep(initialConfig)} : {}),
            layerHeader: layerManager?.layerHeader,
            layerTail: layerManager?.layerTail
        });

        const {addRecordCompId, setAddRecordCompId} = this.options.eventOperateStore;
        /**
         * addRecordCompId为不为null，说明是从组件面板拖拽添加的组件要记录操作日志，反之其他操作导致的组件添加则不记录日志
         */
        if (addRecordCompId && addRecordCompId === layer.id) {
            this.captureHistory({
                actions: [
                    {type: OperateType.ADD, prev: addPrev, next: addNext},
                    {type: OperateType.UPDATE_LAYER, prev: updLayerPrev, next: updLayerNext}
                ]
            });
            setAddRecordCompId(null);
        }
        runInAction(() => {
            if (initialConfig)
                layerManager.elemConfigs![layer.id!] = cloneDeep(initialConfig);
            layerConfigs[layer.id + ""] = layer;
        })
        updateLayer(updLayerNext);
    }

    public doUseTemplate(templateInfo: { configs: Record<string, any>, layers: Record<string, ILayerItem> }): UseTemplateOperateResult {
        const applied = this.applyUseTemplate(templateInfo);
        if (!applied) return {appliedLayerIds: [], layerIdMap: {}};
        this.captureHistory(applied.record);
        return applied.result;
    }

    private applyUseTemplate(templateInfo: {configs: Record<string, any>; layers: Record<string, ILayerItem>}): {
        result: UseTemplateOperateResult;
        record: IHistoryRecords;
    } | undefined {
        const {configs, layers: oldLayers} = templateInfo;
        if (!configs || !oldLayers)
            return undefined;
        const addPrev: IAddOperateData[] = [];
        const addNext: IAddOperateData[] = [];
        const updLayerPrev: IUpdLayerOperateData[] = [];
        const updLayerNext: IUpdLayerOperateData[] = [];

        /** 1. 获取待处理图层列表的分组映射关系 */
        const groupMapping = new Map<string, string[]>();
        const topLevelLayers: Record<string, ILayerItem> = {};
        const layerIds = Object.values(oldLayers).map(layer => layer.id!);
        layerIds.forEach(id => {
            const layer = oldLayers[id];
            if (layer.pid && layerIds.includes(layer.pid)) {
                if (!groupMapping.has(layer.pid))
                    groupMapping.set(layer.pid, [layer.id!]);
                else
                    groupMapping.get(layer.pid)!.push(layer.id!);
            } else {
                topLevelLayers[layer.id!] = layer;
                layer.pid = undefined;
            }
        })

        /** 3. 构建主干链表 */
        const {head, tail} = LayerUtil.buildADoublyLinkedListOfLayers(topLevelLayers);

        /** 4. 构建分支链表 */
        groupMapping.forEach((childIds, pid) => {
            const childLayers = childIds.reduce((acc, id) => {
                acc[id] = oldLayers[id];
                return acc;
            }, {} as Record<string, ILayerItem>);
            const {head, tail} = LayerUtil.buildADoublyLinkedListOfLayers(childLayers);
            const parentLayer = oldLayers[pid];
            parentLayer.childHeader = head!;
            parentLayer.childTail = tail!;
        })

        const newConfigs = cloneDeep(Object.values(configs));
        const newLayers = cloneDeep(Object.values(oldLayers));
        const idNewToOld: Record<string, string> = {};
        const idOldToNew: Record<string, string> = {};

        //设置新id并复位关联关系
        const currentModel = this.readLegacyModel()!;
        const existingIds = new Set(Object.keys(currentModel.layerManager?.layerConfigs ?? {}));
        const generatedIds = new Set<string>();
        newLayers.forEach((layer) => {
            const oldId = layer.id;
            const newId = IdGenerate.generateId();
            if (typeof newId !== 'string' || !newId.trim() || existingIds.has(newId) || generatedIds.has(newId))
                throw new Error('插入模板时生成了无效或重复的图层ID。');
            generatedIds.add(newId);
            idNewToOld[newId] = oldId!;
            idOldToNew[oldId!] = newId;
            const config = newConfigs.find(config => config.base['id'] === oldId)
            if (config && config.base)
                config && (config.base['id'] = newId);
            layer.id = newId;
            layer.pid = undefined;
            layer.childHeader = undefined;
            layer.childTail = undefined;
            layer.prev = undefined;
            layer.next = undefined;
        })
        //恢复config
        const {layerManager} = this.readLegacyModel()!;
        const {elemConfigs, layerConfigs} = layerManager!;
        const {headerId: currentHeaderId, tailId: currentTailId} = this.resolveValidRootAnchors(layerManager, layerConfigs);
        newConfigs.forEach(config => {
            elemConfigs![config.base['id']] = config;
        })

        runInAction(() => {
            //恢复layer
            newLayers.forEach(newLayer => {
                const oldLayer = oldLayers[idNewToOld[newLayer.id!]];
                if (oldLayer.pid && oldLayer.pid in oldLayers)
                    newLayer.pid = idOldToNew[oldLayer.pid];
                if (oldLayer.prev && oldLayer.prev in oldLayers)
                    newLayer.prev = idOldToNew[oldLayer.prev];
                if (oldLayer.next && oldLayer.next in oldLayers)
                    newLayer.next = idOldToNew[oldLayer.next];
                if (newLayer.type === 'group') {
                    if (oldLayer.childTail)
                        newLayer.childTail = idOldToNew[oldLayer.childTail];
                    if (oldLayer.childHeader)
                        newLayer.childHeader = idOldToNew[oldLayer.childHeader];
                }
                layerConfigs[newLayer.id!] = newLayer;
            })

            //获取新队列的头尾指针
            const queueHead = idOldToNew[head!];
            const queueTail = idOldToNew[tail!];
            const queueTailLayer = newLayers.find(layer => layer.id === queueTail)!;

            //头插法建立双向链表
            if (!currentHeaderId) {
                //首次插入
                addPrev.push({layerHeader: currentHeaderId, layerTail: currentTailId})
                layerManager!.layerHeader = queueHead!;
                layerManager!.layerTail = queueTail!;
            } else {
                //非首次插入
                addPrev.push({layerHeader: currentHeaderId, layerTail: currentTailId})
                const oldHeaderLayer = layerConfigs[currentHeaderId];
                updLayerPrev.push({id: oldHeaderLayer.id, prev: oldHeaderLayer.prev})
                oldHeaderLayer.prev = queueTail!;
                queueTailLayer.next = oldHeaderLayer.id;
                layerManager.layerHeader = queueHead!;
                layerManager.layerTail = currentTailId ?? oldHeaderLayer.id;
                updLayerNext.push({id: oldHeaderLayer.id, prev: queueTail!})
            }
        })

        newLayers.forEach(layer => {
            addNext.push({
                id: layer.id,
                layerConfig: cloneDeep(layer),
                elemConfig: elemConfigs![layer.id!],
                layerHeader: layerManager.layerHeader,
                layerTail: layerManager.layerTail
            })
        })

        return {
            record: {
                actions: [
                    {type: OperateType.ADD, prev: addPrev, next: addNext},
                    {type: OperateType.UPDATE_LAYER, prev: updLayerPrev, next: updLayerNext}
                ]
            },
            result: {
                appliedLayerIds: newLayers
                    .map((layer) => layer.id)
                    .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
                layerIdMap: idOldToNew,
            },
        };
    }

    /**
     * Validates the source-to-config mapping before applying an AI or external template.
     * The legacy insertion is synchronous and records history only after the full write;
     * restoring the captured manager snapshot covers exceptions during that write.
     */
    public doUseTemplateAtomically(
        templateInfo: {configs: Record<string, any>; layers: Record<string, ILayerItem>},
        requiredSourceIds: readonly string[],
    ): UseTemplateOperateResult | undefined {
        const configs = templateInfo?.configs;
        const layers = templateInfo?.layers;
        if (!configs || typeof configs !== 'object' || !layers || typeof layers !== 'object'
            || !Array.isArray(requiredSourceIds) || requiredSourceIds.length === 0)
            return undefined;

        const layerEntries = Object.entries(layers);
        const sourceIds = layerEntries.map(([key, layer]) => {
            if (!layer || typeof layer !== 'object' || typeof layer.id !== 'string' || !layer.id.trim() || layer.id !== key)
                return undefined;
            return layer.id;
        });
        if (layerEntries.length === 0 || sourceIds.some(id => !id) || new Set(sourceIds).size !== sourceIds.length)
            return undefined;

        const sourceIdSet = new Set(sourceIds as string[]);
        const requiredIds = [...requiredSourceIds];
        if (new Set(requiredIds).size !== requiredIds.length
            || requiredIds.some(id => typeof id !== 'string' || !sourceIdSet.has(id)))
            return undefined;

        const configuredIds = new Set<string>();
        for (const config of Object.values(configs)) {
            const id = config?.base?.id;
            if (typeof id !== 'string' || !sourceIdSet.has(id) || configuredIds.has(id))
                return undefined;
            configuredIds.add(id);
        }
        if (requiredIds.some(id => !configuredIds.has(id)))
            return undefined;

        const model = this.readLegacyModel();
        const layerManager = model?.layerManager;
        const previousData = layerManager?.getData?.();
        if (!model || !layerManager || !previousData || typeof layerManager.init !== 'function')
            return undefined;
        const previousControllerConfigs = Object.entries(layerManager.controllers ?? {}).flatMap(([id, controller]: [string, any]) => {
            const config = controller?.getConfig?.();
            return config == null ? [] : [[id, cloneDeep(config)] as const];
        });

        try {
            const applied = this.applyUseTemplate({configs: cloneDeep(configs), layers: cloneDeep(layers)});
            if (!applied || applied.result.appliedLayerIds.length !== sourceIds.length
                || sourceIds.some(id => !id || !applied.result.layerIdMap[id])) {
                this.restoreTemplateSnapshot(layerManager, previousData, previousControllerConfigs);
                return undefined;
            }
            this.captureHistory(applied.record);
            return applied.result;
        } catch (error) {
            try {
                this.restoreTemplateSnapshot(layerManager, previousData, previousControllerConfigs);
            } catch (rollbackError) {
                throw new AggregateError([error, rollbackError], '模板插入失败且模型回滚也失败。');
            }
            throw error;
        }
    }

    private restoreTemplateSnapshot(layerManager: any, snapshot: any, controllerConfigs: readonly (readonly [string, any])[]) {
        const restored = cloneDeep(snapshot);
        layerManager.init(restored);
        layerManager.layerHeader = restored.layerHeader;
        layerManager.layerTail = restored.layerTail;
        const errors: unknown[] = [];
        controllerConfigs.forEach(([id, config]) => {
            const controller = layerManager.controllers?.[id];
            if (!controller) return;
            try {
                // Controller.update merges; replace the stored config first so removed keys are restored too.
                controller.config = cloneDeep(config);
                controller.update(cloneDeep(config), {reRender: true});
                if (config?.data && Object.prototype.hasOwnProperty.call(config.data, 'value'))
                    controller.changeData?.(cloneDeep(config.data.value));
                controller.updateFilter?.(config?.filter);
            } catch (error) { errors.push(error); }
        });
        if (errors.length) throw new AggregateError(errors, '恢复模板插入前的图层状态失败。');
    }

    public doDelete(targetIds: string[]): void {
        const {layerManager} = this.readLegacyModel()!;
        const {delItem, layerConfigs, controllers} = layerManager;
        const {setTargetIds} = this.options.eventOperateStore;
        targetIds = [...new Set(targetIds)].filter(id => Boolean(layerConfigs[id]));
        if (targetIds.length === 0)
            return;

        const scene = this.transaction?.scene ?? this.options.readScene();
        const blueprintChange = scene?.blueprints.removeNodes(targetIds);
        this.trackSceneChange(blueprintChange);

        if (targetIds.length) this.options.eventOperateStore.emitInspectorChange({kind: 'targets-deleted', ids: targetIds});

        const delPrev: IDelOperateData[] = [];
        const delNext: IDelOperateData[] = [];
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];

        //计算本次操作所涉及到的所有图层id
        const relatedLayerIds: Set<string> = new Set();
        targetIds.forEach((id) => {
            const layer = layerConfigs[id];
            relatedLayerIds.add(id);
            if (layer.next)
                relatedLayerIds.add(layer.next);
            if (layer.prev)
                relatedLayerIds.add(layer.prev);
            if (layer.pid) {
                const parentLayer = layerConfigs[layer.pid];
                if (parentLayer.childHeader === id)
                    relatedLayerIds.add(parentLayer.id!);
                if (parentLayer.childTail === id)
                    relatedLayerIds.add(parentLayer.id!);
            }
        });

        const toBeUpd = Array.from(relatedLayerIds).filter((id) => !targetIds.includes(id));

        //记录删除前状态
        targetIds.forEach((id) => {
            const layer = layerConfigs[id];
            const elemConfig = controllers[id] && controllers[id].getConfig();
            delPrev.push({id, layerConfig: cloneDeep(layer), elemConfig: elemConfig})
        });
        updPrev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        toBeUpd.forEach((id) => {
            const layer = layerConfigs[id];
            const {next, prev, childHeader, childTail, pid} = layer;
            updPrev.push({id, next, prev, childHeader, childTail, pid});
        })

        //修改数据
        runInAction(() => {
            targetIds.forEach((id) => {
                const layer = layerConfigs[id];
                const prevLayer = layerConfigs[layer.prev!];
                const nextLayer = layerConfigs[layer.next!];

                if (layer.id === layerManager.layerHeader)
                    layerManager.layerHeader = layer.next;
                if (layer.id === layerManager.layerTail)
                    layerManager.layerTail = layer.prev;

                prevLayer && (prevLayer.next = layer?.next);
                nextLayer && (nextLayer.prev = layer?.prev);
                if (layer.pid) {
                    const parentLayer = layerConfigs[layer.pid];
                    if (parentLayer.childHeader === id)
                        parentLayer.childHeader = layer?.next;
                    if (parentLayer.childTail === id)
                        parentLayer.childTail = layer?.prev;
                }
            });
            delItem(targetIds);
        });

        //记录删除后状态
        toBeUpd.forEach((id) => {
            const layer = layerConfigs[id];
            const {next, prev, childHeader, childTail, pid} = layer;
            updNext.push({id, next, prev, childHeader, childTail, pid});
        });
        delNext.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})

        this.captureHistory({
            actions: [
                {type: OperateType.DEL, prev: delPrev, next: delNext},
                {type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}
            ]
        }, blueprintChange);

        setTargetIds([]);
        //删除组件后，重新聚焦鼠标指针到容器上，避免鼠标失去焦点导致其他快捷键失效。
        this.options.eventOperateStore.focusDesignerCanvas();
    }

    public doRepairOrphansPrepend(orphanIds: string[]): void {
        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs, updateLayer} = layerManager;
        const {setTargetIds} = this.options.eventOperateStore;
        if (!orphanIds || orphanIds.length === 0)
            return;

        const analysis = LayerRepairUtil.scanCanvasRepairAnalysis(layerManager);
        const orphanIdSet = new Set(analysis.orphanIds);
        const normalizedTargetIds = LayerRepairUtil.sortLayerIdsForRepair(
            Array.from(new Set(orphanIds.filter(id => orphanIdSet.has(id) && !!layerConfigs[id]))),
            layerConfigs
        );
        if (normalizedTargetIds.length === 0)
            return;

        const oldHeaderId = typeof layerManager.layerHeader === "string" && layerConfigs[layerManager.layerHeader]
            ? layerManager.layerHeader
            : undefined;
        const visibleTailId = analysis.renderTailId;

        const prev: IUpdLayerOperateData[] = [
            {layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail}
        ];
        const next: IUpdLayerOperateData[] = [];

        const repairLayerMap: Record<string, ILayerItem> = {};
        normalizedTargetIds.forEach((id) => {
            const layer = layerConfigs[id];
            if (!layer)
                return;
            prev.push(this.snapshotLayerForRepair(layer));
            repairLayerMap[id] = cloneDeep(layer);
        });

        const {head: orphanHeadId, tail: orphanTailId} = LayerRepairUtil.rebuildLinkedListByOrder(repairLayerMap);
        if (oldHeaderId && orphanTailId && repairLayerMap[orphanTailId]) {
            repairLayerMap[orphanTailId].next = oldHeaderId;
        }
        const repairLayers = Object.values(repairLayerMap);
        let headerLayer: ILayerItem | undefined;
        if (oldHeaderId && orphanTailId) {
            headerLayer = cloneDeep(layerConfigs[oldHeaderId]);
            headerLayer.prev = orphanTailId;
            repairLayers.push(headerLayer);
        }

        runInAction(() => {
            updateLayer(repairLayers);
            layerManager.layerHeader = orphanHeadId;
            layerManager.layerTail = visibleTailId ?? orphanTailId;
        });

        next.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail});
        repairLayers.forEach((layer) => {
            if (layer.id)
                next.push(this.snapshotLayerForRepair(layer));
        });

        this.captureHistory({
            actions: [{type: OperateType.UPDATE_LAYER, prev, next}]
        });

        setTargetIds(normalizedTargetIds);
        this.options.eventOperateStore.focusDesignerCanvas();
    }

    public doRepairTailPointer(nextTailId: string): void {
        const {layerManager} = this.readLegacyModel()!;
        if (!nextTailId || layerManager.layerTail === nextTailId)
            return;

        const prev: IUpdLayerOperateData[] = [
            {layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail}
        ];
        const next: IUpdLayerOperateData[] = [
            {layerHeader: layerManager.layerHeader, layerTail: nextTailId}
        ];

        runInAction(() => {
            layerManager.layerTail = nextTailId;
        });

        this.captureHistory({
            actions: [{type: OperateType.UPDATE_LAYER, prev, next}]
        });

        this.options.eventOperateStore.focusDesignerCanvas();
    }

    public doReplaceComponent(templateInfo: { configs: Record<string, any>, layers: Record<string, ILayerItem> }, oldId: string): string | null {
        const {configs, layers} = templateInfo ?? {};
        if (!oldId || !configs || !layers) {
            return null;
        }

        const newLayers = Object.values(layers);
        if (newLayers.length !== 1) {
            return null;
        }

        const newLayer = cloneDeep(newLayers[0]);
        if (!newLayer?.id) {
            return null;
        }

        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs, controllers, elemConfigs} = layerManager;
        const oldLayer = layerConfigs[oldId];
        if (!oldLayer || oldLayer.type === "group") {
            return null;
        }

        const newId = newLayer.id!;
        const oldController = controllers[oldId];
        const oldConfig = oldController?.getConfig?.() ?? elemConfigs?.[oldId] ?? null;
        const oldHeaderId = layerManager.layerHeader;
        const oldTailId = layerManager.layerTail;
        const oldPrevId = oldLayer.prev;
        const oldNextId = oldLayer.next;
        const oldPid = oldLayer.pid;
        const parentLayer = oldPid ? layerConfigs[oldPid] : undefined;

        const headerAfterDelete = !oldPid && oldHeaderId === oldId ? (oldNextId ?? undefined) : oldHeaderId;
        const tailAfterDelete = !oldPid && oldTailId === oldId ? (oldPrevId ?? undefined) : oldTailId;
        const finalHeaderId = !oldPid && oldHeaderId === oldId ? newId : headerAfterDelete;
        const finalTailId = !oldPid && oldTailId === oldId ? newId : tailAfterDelete;

        const delPrev: IDelOperateData[] = [
            {id: oldId, layerConfig: cloneDeep(oldLayer), elemConfig: cloneDeep(oldConfig)},
            {layerHeader: oldHeaderId, layerTail: oldTailId},
        ];
        const delNext: IDelOperateData[] = [
            {layerHeader: headerAfterDelete, layerTail: tailAfterDelete},
        ];
        const addPrev: IAddOperateData[] = [
            {layerHeader: headerAfterDelete, layerTail: tailAfterDelete},
        ];
        const addNext: IAddOperateData[] = [
            {
                id: newId,
                layerConfig: cloneDeep(newLayer),
                elemConfig: cloneDeep(configs[newId]),
                layerHeader: finalHeaderId,
                layerTail: finalTailId,
            },
        ];

        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];
        const relatedLayerIds = new Set<string>();
        if (oldPrevId) {
            relatedLayerIds.add(oldPrevId);
        }
        if (oldNextId) {
            relatedLayerIds.add(oldNextId);
        }
        if (oldPid) {
            relatedLayerIds.add(oldPid);
        }
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            if (layer) {
                updPrev.push({
                    id: layer.id!,
                    prev: layer.prev,
                    next: layer.next,
                    childHeader: layer.childHeader,
                    childTail: layer.childTail,
                    pid: layer.pid,
                });
            }
        });

        runInAction(() => {
            // This adapter owns detached config facades; runtime controllers are not available here.
            delete layerConfigs[oldId];
            delete controllers[oldId];

            layerConfigs[newId] = newLayer;
            elemConfigs![newId] = cloneDeep(configs[newId]);

            const prevLayer = oldPrevId ? layerConfigs[oldPrevId] : undefined;
            const nextLayer = oldNextId ? layerConfigs[oldNextId] : undefined;
            if (prevLayer) {
                prevLayer.next = newId;
            }
            if (nextLayer) {
                nextLayer.prev = newId;
            }

            newLayer.prev = oldPrevId;
            newLayer.next = oldNextId;
            newLayer.pid = oldPid;

            if (!oldPid) {
                if (oldHeaderId === oldId) {
                    layerManager.layerHeader = newId;
                }
                if (oldTailId === oldId) {
                    layerManager.layerTail = newId;
                }
            } else if (parentLayer) {
                if (parentLayer.childHeader === oldId) {
                    parentLayer.childHeader = newId;
                }
                if (parentLayer.childTail === oldId) {
                    parentLayer.childTail = newId;
                }
            }

        });

        layerManager.reRenderLayer();

        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            if (layer) {
                updNext.push({
                    id: layer.id!,
                    prev: layer.prev,
                    next: layer.next,
                    childHeader: layer.childHeader,
                    childTail: layer.childTail,
                    pid: layer.pid,
                });
            }
        });

        this.captureHistory({
            actions: [
                {type: OperateType.DEL, prev: delPrev, next: delNext},
                {type: OperateType.ADD, prev: addPrev, next: addNext},
                {type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext},
            ]
        });

        const {setTargetIds, focusDesignerCanvas} = this.options.eventOperateStore;
        setTargetIds([]);
        focusDesignerCanvas();

        return newId;
    }

    /**
     * @see https://picss.sunbangyan.cn/2023/12/04/6d352450af32841a97f4784d2252eeb8.jpeg
     * 被克隆的图层可以同时包含普通图层、分组图层和分组图层的子图层。
     * 1.普通图层和没有包含分组图层的子图层，则直接克隆。
     * 2.对于分组图层和其下的子图层，克隆时需要创建克隆前后的映射关系，克隆完毕后根据映射关系恢复新图层之前的层级关系。
     * @param ids
     */
    public doClone(ids: string[]): string[] {
        if (ids.length === 0)
            return [];

        const addPrev: IAddOperateData[] = [];
        const addNext: IAddOperateData[] = [];
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];
        const layerIdOldToNew: Record<string, string> = {};
        const newLayouts: ILayerItem[] = [];
        const newIds: string[] = [];

        const {layerManager} = this.readLegacyModel()!;
        //计算复制操作所涉及的所有图层
        const relatedLayerIds: Set<string> = new Set();
        ids.forEach((id) => {
            const layer = layerManager.layerConfigs[id];
            relatedLayerIds.add(id)
            if (layer.prev)
                relatedLayerIds.add(layer.prev);
            if (layer.pid) {
                const parentLayer = layerManager.layerConfigs[layer.pid];
                if (parentLayer) {
                    relatedLayerIds.add(parentLayer.id!);
                    relatedLayerIds.add(parentLayer.childHeader!);
                }
            }
        });

        //记录操作前状态
        updPrev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const layer = layerManager.layerConfigs[id];
            const {prev, next, childHeader, childTail, pid} = layer;
            updPrev.push({id, prev, next, childHeader, childTail, pid})
        })

        //执行复制操作
        runInAction(() => {
            const {layerConfigs, controllers, elemConfigs} = layerManager;
            const oldLayerList = ids.map((id) => layerConfigs[id]);

            //复制数据
            ids.forEach((oldLayerId) => {
                const oldLayer = layerConfigs[oldLayerId];
                const newLayer = cloneDeep(oldLayer);
                newLayer.id = IdGenerate.generateId();
                newLayer.name = oldLayer.name + "-副本";
                newLayer.prev = undefined;
                newLayer.next = undefined;
                if (newLayer.type !== 'group') {
                    newLayer.x = newLayer.x! + 10;
                    newLayer.y = newLayer.y! + 10;
                }
                layerConfigs[newLayer.id] = newLayer;
                layerIdOldToNew[oldLayerId] = newLayer.id!;

                //生成新组件配置项数据
                const oldCompController = controllers[oldLayer.id!];
                if (oldCompController) {
                    const newConfig = cloneDeep(oldCompController.getConfig());
                    newConfig.base.id = newLayer.id;
                    elemConfigs![newLayer.id] = newConfig;
                }
                newIds.push(newLayer.id);
                newLayouts.push(newLayer);
            });

            //更新复制后的图层层级关系
            ids.forEach((oldLayerId) => {
                const oldLayer = layerConfigs[oldLayerId];
                const newLayer = layerConfigs[layerIdOldToNew[oldLayerId]];

                if (oldLayer.type === 'group') {
                    newLayer.childHeader = layerIdOldToNew[LayerUtil.findTopLayerInGroup(oldLayer?.id ?? '', oldLayerList)!];
                    newLayer.childTail = layerIdOldToNew[LayerUtil.findBottomLayerInGroup(oldLayer?.id ?? '', oldLayerList)!];
                }

                //不在分组内的图层
                if (!oldLayer.pid) {
                    const oldPrevLayer = layerConfigs[oldLayer.prev!];
                    newLayer.prev = oldPrevLayer?.id;
                    newLayer.next = oldLayer?.id;
                    oldLayer && (oldLayer.prev = newLayer.id);
                    oldPrevLayer && (oldPrevLayer.next = newLayer.id);
                    if (oldLayer.id === layerManager.layerHeader)
                        layerManager.layerHeader = newLayer.id;
                } else {
                    //在分组内的图层，且整个分组都需要复制
                    if (oldLayer.pid && ids.includes(oldLayer.pid)) {
                        newLayer.prev = layerIdOldToNew[oldLayer.prev!];
                        newLayer.next = layerIdOldToNew[oldLayer.next!];
                        newLayer.pid = layerIdOldToNew[oldLayer.pid!];
                    } else { //在分组内，但仅分组内的单个图层复制
                        const oldChildPrevLayer = layerConfigs[oldLayer.prev!];
                        newLayer.prev = oldChildPrevLayer?.id;
                        newLayer.next = oldLayer?.id;
                        oldLayer && (oldLayer.prev = newLayer.id);
                        oldChildPrevLayer && (oldChildPrevLayer.next = newLayer.id);

                        const parentLayer = layerConfigs[oldLayer.pid!];
                        if (parentLayer.childHeader === oldLayer.id)
                            parentLayer.childHeader = newLayer.id;
                    }
                }
            });
        });

        //记录操作后数据
        updNext.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const layer = layerManager.layerConfigs[id];
            const {prev, next, childHeader, childTail, pid} = layer;
            updNext.push({id, prev, next, childHeader, childTail, pid})
        })
        newIds.forEach((id) => {
            const newLayer = layerManager.layerConfigs[id];
            const newConfig = layerManager.elemConfigs![id];
            if (newLayer.type === 'group')
                addNext.push({id: id, layerConfig: cloneDeep(newLayer)})
            else
                addNext.push({id: id, layerConfig: cloneDeep(newLayer), elemConfig: newConfig})
        })

        this.captureHistory({
            actions: [
                {type: OperateType.ADD, prev: addPrev, next: addNext},
                {type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext},
            ]
        })
        //多个组件同时复制时，需要计算多选框的新位置
        if (newLayouts.length > 1) {
            const {groupCoordinate, setGroupCoordinate} = this.options.eventOperateStore;
            setGroupCoordinate({minX: groupCoordinate.minX! + 10, minY: groupCoordinate.minY! + 10})
        }
        return newIds;
    }

    public doHideUpd(ids: string[], hide: boolean): void {
        const {layerManager} = this.readLegacyModel()!;
        //真实隐藏的数据结构列表
        const realHideList = LayerUtil.combineCalculationsActiveLayers(ids, layerManager.layerConfigs).map(id => ({id, hide}));

        const prev: IHideOperateData[] = [];
        const next: IHideOperateData[] = [];
        const {layerConfigs, updateLayer} = layerManager;
        realHideList.forEach((item) => {
            const {id} = item;
            const oldHideData = layerConfigs[id!];
            prev.push({id, hide: oldHideData.hide!});
            next.push({id, hide});
        })
        const data: IHistoryRecord = {type: OperateType.HIDE, prev, next}
        this.captureHistory({actions: [data]});
        //更新隐藏状态
        updateLayer(realHideList);
        //取消所有选中状态
        this.options.eventOperateStore.setTargetIds([]);

        this.options.eventOperateStore.emitLayerUiEvent({kind: 'refresh', sceneVersion: this.currentSceneVersion()});
    }

    public doLockUpd(items: ILayerItem[]): void {
        const prev: ILockOperateData[] = [];
        const next: ILockOperateData[] = [];
        const {layerConfigs, updateLayer} = this.readLegacyModel()!.layerManager!;
        items.forEach((item) => {
            const {id, lock} = item;
            next.push({id: id!, lock: lock!});
            const oldLockData = layerConfigs[id!];
            prev.push({id: id!, lock: oldLockData.lock!});
        })
        const data: IHistoryRecord = {type: OperateType.LOCK, prev, next}
        this.captureHistory({actions: [data]});
        updateLayer(items);
        this.options.eventOperateStore.emitLayerUiEvent({kind: 'refresh', sceneVersion: this.currentSceneVersion()});
    }

    /** Rename a layer and its controller config as one undoable canvas edit. */
    public doLayerRename(id: string, name: string): boolean {
        const model = this.readLegacyModel();
        const layerManager = model?.layerManager;
        const layer = layerManager?.layerConfigs?.[id];
        if (!layer || !name || layer.name === name || !this.options.isActive() || this.readLegacyModel() !== model)
            return false;
        const previousName = layer.name;
        const previous = [{id, name: previousName}];
        const next = [{id, name}];
        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev: previous, next}]});
        layerManager.updateLayer(next);
        layerManager.controllers?.[id]?.update({base: {name}}, {reRender: false});
        this.options.eventOperateStore.emitLayerUiEvent({kind: 'refresh', sceneVersion: this.currentSceneVersion()});
        return true;
    }

    /**
     * 判断是否可以上移图层
     * @param targetIds
     * @private
     */
    private canMoveUp(targetIds: string[]): boolean {
        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs} = layerManager;
        const layerHeaderMap: Record<string, string[]> = {};

        targetIds.forEach((id) => {
            const layer = layerConfigs[id];
            if (layer.pid) {
                const parentLayer = layerConfigs[layer.pid]
                if (parentLayer.childHeader) {
                    if (!layerHeaderMap[parentLayer.childHeader])
                        layerHeaderMap[parentLayer.childHeader] = [id];
                    else
                        layerHeaderMap[parentLayer.childHeader].push(id);
                }
            } else {
                if (!layerHeaderMap[layerManager.layerHeader!])
                    layerHeaderMap[layerManager.layerHeader!] = [id];
                else
                    layerHeaderMap[layerManager.layerHeader!].push(id);
            }
        })

        for (const [header, layerIds] of Object.entries(layerHeaderMap)) {
            if (layerIds.includes(header!)) {
                let count = 1;
                let layer = layerConfigs[header]
                while (layer.next) {
                    layer = layerConfigs[layer.next];
                    if (targetIds.includes(layer.id!))
                        count++;
                    else
                        break;
                }
                if (count >= layerIds.length)
                    targetIds = targetIds.filter(id => !layerIds.includes(id))
            }
        }

        return targetIds.length !== 0;
    }

    /**
     * 判断图层是否可以下移
     * @param targetIds
     * @private
     */
    private canMoveDown(targetIds: string[]): boolean {
        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs} = layerManager;
        const layerTailMap: Record<string, string[]> = {};

        targetIds.forEach((id) => {
            const layer = layerConfigs[id];
            if (layer.pid) {
                const parentLayer = layerConfigs[layer.pid]
                if (parentLayer.childTail) {
                    if (!layerTailMap[parentLayer.childTail])
                        layerTailMap[parentLayer.childTail] = [id];
                    else
                        layerTailMap[parentLayer.childTail].push(id);
                }
            } else {
                if (!layerTailMap[layerManager.layerTail!])
                    layerTailMap[layerManager.layerTail!] = [id];
                else
                    layerTailMap[layerManager.layerTail!].push(id);
            }
        })


        for (const [tail, layerIds] of Object.entries(layerTailMap)) {
            if (layerIds.includes(tail!)) {
                let count = 1;
                let layer = layerConfigs[tail]
                while (layer.prev) {
                    layer = layerConfigs[layer.prev];
                    if (targetIds.includes(layer.id!))
                        count++;
                    else
                        break;
                }
                if (count >= layerIds.length)
                    targetIds = targetIds.filter(id => !layerIds.includes(id))
            }
        }

        return targetIds.length !== 0;
    }

    public doLayerToTop(): void {
        const {targetIds} = this.options.eventOperateStore;
        if (targetIds.length === 0)
            return;

        if (!this.canMoveUp(targetIds))
            return;

        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs} = layerManager!;
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];

        let finalTargetIds = targetIds.filter((id) => {
            const layer = layerConfigs[id];
            return !layer.pid || (layer.pid && !targetIds.includes(layer.pid));
        })

        //计算相关的图层id
        const relatedLayerIds: Set<string> = new Set();
        relatedLayerIds.add(layerManager?.layerHeader ?? '');
        finalTargetIds.forEach((id) => {
            const layer = layerConfigs[id];
            relatedLayerIds.add(id);
            layer.next && relatedLayerIds.add(layer.next);
            layer.prev && relatedLayerIds.add(layer.prev);
            layer.pid && relatedLayerIds.add(layer.pid);
        });

        //记录数据修改前状态
        updPrev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const {prev, next, childHeader, childTail} = layerConfigs[id];
            updPrev.push({id, prev, next, childHeader, childTail})
        });

        //将被操作图层排序
        finalTargetIds = finalTargetIds.sort((prev, next) => {
            const prevLayer = layerConfigs[prev];
            const nextLayer = layerConfigs[next];
            return prevLayer.order! - nextLayer.order!;
        });

        //修改数据
        runInAction(() => {
            for (let i = 0; i < finalTargetIds.length; i++) {
                const id = finalTargetIds[i];
                const layer = layerConfigs[id];
                const prevLayer = layerConfigs[layer.prev!];
                const nextLayer = layerConfigs[layer.next!];
                if (layer.pid) {
                    //组内元素
                    const parentLayer = layerConfigs[layer.pid!];
                    if (parentLayer.childHeader === id)
                        continue;
                    const oldHeaderChildLayer = layerConfigs[parentLayer.childHeader!];
                    layer.prev = undefined;
                    layer.next = parentLayer?.childHeader;
                    prevLayer && (prevLayer.next = nextLayer?.id);
                    nextLayer && (nextLayer.prev = prevLayer?.id);
                    oldHeaderChildLayer && (oldHeaderChildLayer.prev = id);
                    parentLayer.childHeader = id;
                    if (id === parentLayer.childTail)
                        parentLayer.childTail = prevLayer?.id;
                } else {
                    //组外元素
                    if (layerManager.layerHeader === id)
                        continue;
                    layer.prev = undefined;
                    layer.next = layerManager.layerHeader;
                    prevLayer && (prevLayer.next = nextLayer?.id);
                    nextLayer && (nextLayer.prev = prevLayer?.id);
                    const oldHeaderLayer = layerConfigs[layerManager.layerHeader!];
                    oldHeaderLayer && (oldHeaderLayer.prev = id);
                    layerManager.layerHeader = id;
                    if (id === layerManager.layerTail)
                        layerManager.layerTail = prevLayer?.id;
                }
            }
        })

        //记录数据修改后状态
        updNext.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const {prev, next, childHeader, childTail} = layerConfigs[id];
            updNext.push({id, prev, next, childHeader, childTail})
        });

        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}]});
        layerManager.reRenderLayer();
    }

    public doLayerToBottom(): void {
        const {targetIds} = this.options.eventOperateStore;
        if (targetIds.length === 0 || !this.canMoveDown(targetIds))
            return;

        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];
        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs} = layerManager;

        let finalTargetIds = targetIds.filter((id) => {
            const layer = layerConfigs[id];
            return !layer.pid || (layer.pid && !targetIds.includes(layer.pid));
        })

        //计算相关的图层id
        const relatedLayerIds: Set<string> = new Set();
        relatedLayerIds.add(layerManager.layerTail!)
        finalTargetIds.forEach((id) => {
            const layer = layerConfigs[id];
            relatedLayerIds.add(id);
            layer.next && relatedLayerIds.add(layer.next);
            layer.prev && relatedLayerIds.add(layer.prev);
            layer.pid && relatedLayerIds.add(layer.pid);
        });

        //记录数据修改前状态
        updPrev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const {prev, next, childHeader, childTail} = layerConfigs[id];
            updPrev.push({id, prev, next, childHeader, childTail})
        });

        //将被操作图层排序
        finalTargetIds = finalTargetIds.sort((prev, next) => {
            const prevLayer = layerConfigs[prev];
            const nextLayer = layerConfigs[next];
            return nextLayer.order! - prevLayer.order!;
        });

        //修改数据
        runInAction(() => {
            for (let i = 0; i < finalTargetIds.length; i++) {
                const id = finalTargetIds[i];
                const layer = layerConfigs[id];
                const prevLayer = layerConfigs[layer.prev!];
                const nextLayer = layerConfigs[layer.next!];
                if (layer.pid) {
                    //组内元素
                    const parentLayer = layerConfigs[layer.pid!];
                    if (id === parentLayer.childTail)
                        continue;
                    const oldTailChildLayer = layerConfigs[parentLayer.childTail!];
                    layer.prev = parentLayer.childTail;
                    layer.next = undefined;
                    prevLayer && (prevLayer.next = nextLayer?.id);
                    nextLayer && (nextLayer.prev = prevLayer?.id);
                    oldTailChildLayer && (oldTailChildLayer.next = id);
                    parentLayer.childTail = id;
                    if (id === parentLayer.childHeader)
                        parentLayer.childHeader = nextLayer?.id;
                } else {
                    //组外元素
                    if (layerManager.layerTail === id)
                        continue;
                    layer.prev = layerManager.layerTail;
                    layer.next = undefined;
                    prevLayer && (prevLayer.next = nextLayer?.id);
                    nextLayer && (nextLayer.prev = prevLayer?.id);
                    const oldTailLayer = layerConfigs[layerManager.layerTail!];
                    oldTailLayer && (oldTailLayer.next = id);
                    layerManager.layerTail = id;
                    if (id === layerManager.layerHeader)
                        layerManager.layerHeader = nextLayer?.id;
                }
            }
        })

        //记录数据修改后状态
        updNext.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const {prev, next, childHeader, childTail} = layerConfigs[id];
            updNext.push({id, prev, next, childHeader, childTail})
        });

        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}]});
        layerManager.reRenderLayer();
    }

    public doLayerMoveUp(): void {
        let {targetIds} = this.options.eventOperateStore;
        if (targetIds.length === 0)
            return;

        if (!this.canMoveUp(targetIds))
            return;

        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs} = layerManager;
        const prev: IUpdLayerOperateData[] = [];
        const next: IUpdLayerOperateData[] = [];

        //收集相关的图层id
        const relatedLayerIds: Set<string> = new Set();
        targetIds.forEach((id) => {
            const layer = layerConfigs[id];
            const prevLayer = layerConfigs[layer.prev!];
            relatedLayerIds.add(id);
            if (layer && layer.next)
                relatedLayerIds.add(layer.next);
            if (layer && layer.prev)
                relatedLayerIds.add(layer.prev);
            if (prevLayer && prevLayer.prev)
                relatedLayerIds.add(prevLayer.prev!);
        });

        //将被操作图层排序
        targetIds = targetIds.sort((prev, next) => {
            const prevLayer = layerConfigs[prev];
            const nextLayer = layerConfigs[next];
            return nextLayer.order! - prevLayer.order!;
        });

        //记录数据变更前状态
        prev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {childTail, childHeader} = layer;
            prev.push({id, prev: layer.prev, next: layer.next, childHeader, childTail})
        });

        //变更数据
        runInAction(() => {
            targetIds.forEach((id) => {
                const layer = layerConfigs[id];
                const prevLayer = layerConfigs[layer.prev!];
                const prevPrevLayer = layerConfigs[prevLayer?.prev ?? ''];
                const nextLayer = layerConfigs[layer.next!];
                if (layer.pid) {
                    //在分组内
                    const parent = layerConfigs[layer.pid];
                    if (id !== parent.childHeader) {
                        if (layer.prev === parent.childHeader)
                            parent.childHeader = id;
                        if (id === parent.childTail)
                            parent.childTail = layer.prev!;
                        layer.prev = prevPrevLayer?.id;
                        layer.next = prevLayer?.id;
                        if (prevLayer) {
                            prevLayer.prev = layer.id
                            prevLayer.next = nextLayer?.id
                        }
                        prevPrevLayer && (prevPrevLayer.next = layer.id)
                        nextLayer && (nextLayer.prev = prevLayer?.id)
                    }
                } else {
                    //不再分组内
                    if (id !== layerManager.layerHeader) {
                        if (layer.prev === layerManager.layerHeader)
                            layerManager.layerHeader = id;
                        if (id === layerManager.layerTail)
                            layerManager.layerTail = layer.prev!;
                        layer.prev = prevPrevLayer?.id;
                        layer.next = prevLayer?.id;
                        if (prevLayer) {
                            prevLayer.prev = layer.id
                            prevLayer.next = nextLayer?.id
                        }
                        prevPrevLayer && (prevPrevLayer.next = layer.id)
                        nextLayer && (nextLayer.prev = prevLayer?.id)
                    }
                }
            })
        })

        //记录数据变更后状态
        next.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {childTail, childHeader} = layer;
            next.push({id, prev: layer.prev, next: layer.next, childHeader, childTail})
        });
        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev, next}]});
        layerManager.reRenderLayer();
    }

    public doLayerMoveDown(): void {
        let {targetIds} = this.options.eventOperateStore;
        if (targetIds.length === 0 || !this.canMoveDown(targetIds))
            return;

        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs} = layerManager;
        const prev: IUpdLayerOperateData[] = [];
        const next: IUpdLayerOperateData[] = [];

        //收集相关的图层id
        const relatedLayerIds: Set<string> = new Set();
        targetIds.forEach((id) => {
            const layer = layerConfigs[id];
            const nextLayer = layerConfigs[layer.next!];
            relatedLayerIds.add(id);
            if (layer && layer.next)
                relatedLayerIds.add(layer.next);
            if (layer && layer.prev)
                relatedLayerIds.add(layer.prev);
            if (nextLayer && nextLayer.next)
                relatedLayerIds.add(nextLayer.next!);
        });

        //将被操作图层排序
        targetIds = targetIds.sort((prev, next) => {
            const prevLayer = layerConfigs[prev];
            const nextLayer = layerConfigs[next];
            return prevLayer.order! - nextLayer.order!;
        });

        //记录数据变更前状态
        prev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {childTail, childHeader} = layer;
            prev.push({id, prev: layer.prev, next: layer.next, childHeader, childTail})
        });

        //变更数据
        runInAction(() => {
            targetIds.forEach((id) => {
                const layer = layerConfigs[id];
                const prevLayer = layerConfigs[layer.prev!];
                const nextLayer = layerConfigs[layer.next!];
                const nextNextLayer = layerConfigs[nextLayer?.next ?? ''];
                if (layer.pid) {
                    //在分组内
                    const parent = layerConfigs[layer.pid];
                    if (id !== parent.childTail) {
                        if (layer.next === parent.childTail)
                            parent.childTail = id;
                        if (id === parent.childHeader)
                            parent.childHeader = layer.next!;
                        layer.prev = nextLayer?.id;
                        layer.next = nextNextLayer?.id;
                        if (nextLayer) {
                            nextLayer.prev = prevLayer?.id
                            nextLayer.next = layer.id
                        }
                        prevLayer && (prevLayer.next = nextLayer?.id)
                        nextNextLayer && (nextNextLayer.prev = layer?.id)
                    }
                } else {
                    //不再分组内
                    if (id !== layerManager.layerTail) {
                        if (layer.next === layerManager.layerTail)
                            layerManager.layerTail = id;
                        if (id === layerManager.layerHeader)
                            layerManager.layerHeader = layer.next!;
                        layer.prev = nextLayer?.id;
                        layer.next = nextNextLayer?.id;
                        if (nextLayer) {
                            nextLayer.prev = prevLayer?.id
                            nextLayer.next = layer.id
                        }
                        prevLayer && (prevLayer.next = nextLayer?.id)
                        nextNextLayer && (nextNextLayer.prev = layer?.id)
                    }
                }
            })
        })

        //记录数据变更后状态
        next.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail})
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {childTail, childHeader} = layer;
            next.push({id, prev: layer.prev, next: layer.next, childHeader, childTail})
        });
        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev, next}]});
        layerManager.reRenderLayer();
    }

    /**
     * 记录组件配置更新
     * @param newData
     * @param oldData
     */
    public doStyleUpd(
        newData: ConfigureObjectFragments,
        oldData: ConfigureObjectFragments,
        targetId: string,
        replaceKeys?: string[],
        statusPrev?: IUpdStyleStatusOperateData,
        statusNext?: IUpdStyleStatusOperateData,
    ): void {
        if (!targetId)
            return;
        const record: IHistoryRecord = {
            type: OperateType.UPD_STYLE,
            prev: {id: targetId, data: oldData, replaceKeys, status: statusPrev} as IUpdStyleOperateData,
            next: {id: targetId, data: newData, replaceKeys, status: statusNext} as IUpdStyleOperateData
        }
        this.captureHistory({actions: [record]});
    }

    public doStyleUpdBatch(items: Array<{
        targetId: string;
        newData: ConfigureObjectFragments;
        oldData: ConfigureObjectFragments;
    }>): void {
        const actions = (Array.isArray(items) ? items : [])
            .filter((item) => item?.targetId)
            .map((item) => ({
                type: OperateType.UPD_STYLE,
                prev: {id: item.targetId, data: item.oldData} as IUpdStyleOperateData,
                next: {id: item.targetId, data: item.newData} as IUpdStyleOperateData,
            } as IHistoryRecord));
        if (actions.length === 0)
            return;
        this.captureHistory({actions});
    }

    /**
     * 图层编组
     */
    public doGrouping() {
        let {directSelectedIds: beGroupIds} = this.options.eventOperateStore;
        if (!beGroupIds || beGroupIds.length <= 1)
            return;
        //获取编组的基准图层。（以最上层的分组图层优先，最上层的非分组图层次之）
        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs, addItem} = layerManager;
        const topLayerId = beGroupIds.reduce((prev, next) => {
            return layerConfigs[prev].order! > layerConfigs[next].order! ? prev : next;
        }, beGroupIds[0]);
        const topPrevLayer = layerConfigs[layerConfigs[topLayerId].prev ?? ''];
        let topNextLayerId = layerConfigs[topLayerId].next ?? '';
        while (beGroupIds.includes(topNextLayerId)) {
            topNextLayerId = layerConfigs[topNextLayerId].next!;
        }
        const topNextLayer = layerConfigs[topNextLayerId];
        const originalPid = layerConfigs[topLayerId].pid; //原始pid，如果topLayerId是分组图层，则最终生成的分组和原始图层所在的分组相同。若没有分组，则pid为undefined


        //构建新的分组数据
        const groupId = IdGenerate.generateId();
        //计算新分组的锁定状态
        const allLock = beGroupIds.every((id) => layerConfigs[id].lock);
        //构建新的分组数据
        const groupItem: ILayerItem = {
            id: groupId,
            type: 'group',
            name: '新建分组',
            hide: false,
            lock: allLock,
        };

        //计算相关图层
        const relatedLayerIds: Set<string> = new Set();
        relatedLayerIds.add(layerManager.layerHeader!);
        beGroupIds.forEach((id) => {
            const layer = layerConfigs[id];
            relatedLayerIds.add(id);
            if (layer.next)
                relatedLayerIds.add(layer.next);
            if (layer.prev)
                relatedLayerIds.add(layer.prev);
            if (layer.pid)
                relatedLayerIds.add(layer.pid);
        });
        if (layerConfigs[topLayerId].type === 'group')
            relatedLayerIds.add(layerConfigs[topLayerId].childHeader!);

        //构建操作记录
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];
        const addNext: IAddOperateData[] = [];

        //记录操作前状态
        updPrev.push({layerHeader: layerManager.layerHeader});
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            if (layer.type === 'group')
                updPrev.push({
                    id,
                    pid: layer.pid,
                    prev: layer.prev,
                    next: layer.next,
                    childHeader: layer.childHeader,
                    childTail: layer.childTail
                });
            else
                updPrev.push({id, pid: layer.pid, prev: layer.prev, next: layer.next});
        });

        let chileHeader = "";
        let chileTail = "";
        //修改数据
        runInAction(() => {
            //对目标图层排序
            beGroupIds = beGroupIds.sort((prev, next) => {
                const prevLayer = layerConfigs[prev];
                const nextLayer = layerConfigs[next];
                return prevLayer.order! - nextLayer.order!;
            });
            beGroupIds.forEach((id) => {
                const layer = layerConfigs[id];
                const prevLayer = layerConfigs[layer.prev!];
                const nextLayer = layerConfigs[layer.next!];
                const parentLayer = layerConfigs[layer.pid!];

                if (layerManager.layerHeader === id)
                    layerManager.layerHeader = groupItem.id;
                if (layerManager.layerTail === id) {
                    //如果当前图层加入分组前layer.prev指向为undefined，则说明所有图层都加入了分组，则最新的layerManager.layerTail指向本次分组的id
                    layerManager.layerTail = layer.prev || groupItem.id;
                }
                const topIsHeader = parentLayer?.childHeader === id;
                const topIsTail = parentLayer?.childTail === id;
                if (parentLayer?.childHeader === id)
                    parentLayer.childHeader = layer.next!;
                if (parentLayer?.childTail === id)
                    parentLayer.childTail = layer.prev!;
                if (topIsHeader && topLayerId === id)
                    parentLayer.childHeader = groupId;
                if (topIsTail && topLayerId === id)
                    parentLayer.childTail = groupId;

                layer.pid = groupId;
                //prev图层和next图层建立联系
                prevLayer && (prevLayer.next = layer.next);
                nextLayer && (nextLayer.prev = layer.prev);
                //清空原有图层的prev和next指针
                layer.prev = undefined;
                layer.next = undefined;

                //头插法建立子双向链表
                if (chileHeader) {
                    const oldChildHeader = layerConfigs[chileHeader];
                    oldChildHeader.prev = id;
                    layer.next = chileHeader;
                } else {
                    chileTail = id;
                }
                chileHeader = id;
            });
            groupItem.childHeader = chileHeader;
            groupItem.childTail = chileTail;
            groupItem.pid = originalPid;
            //将新生成的分组加入到topPreLayer之后
            groupItem.prev = topPrevLayer?.id;
            topPrevLayer && (topPrevLayer.next = groupId);
            groupItem.next = topNextLayer?.id;
            topNextLayer && (topNextLayer.prev = groupId);

            if (!groupItem.next && !groupItem.pid) {
                //如果分组加入图层队列链表后后继节点及父节点都为空，则说明分组加入图层队列链表后为最后一个图层。则将layerManager.layerTail指向此分组
                layerManager.layerTail = groupId;
            }
        });
        addItem(groupItem);
        //记录操作后状态
        updNext.push({layerHeader: layerManager.layerHeader});
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            if (layer.type === 'group')
                updNext.push({
                    id,
                    pid: layer.pid,
                    prev: layer.prev,
                    next: layer.next,
                    childHeader: layer.childHeader,
                    childTail: layer.childTail
                });
            else
                updNext.push({id, pid: layer.pid, prev: layer.prev, next: layer.next});
        });
        addNext.push({id: groupId, layerConfig: groupItem});
        this.captureHistory({
            actions: [
                {type: OperateType.ADD, prev: null, next: addNext},
                {type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}
            ]
        });
        this.options.eventOperateStore.setTargetIds([]);
        //特殊场景处理，如果编组时，所有的子图层都处于锁定状态，则编组后，编组图层也处于锁定状态
    }

    public doUnGrouping() {
        // Remove references to a deleted group in the same history entry as ungrouping.
        const {directSelectedIds, setTargetIds} = this.options.eventOperateStore;
        if (directSelectedIds.length === 0)
            return;
        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs, delItem} = layerManager;
        const groupIds = directSelectedIds.filter((id: string) => layerConfigs[id].type === 'group');
        const scene = this.options.readScene();
        const blueprintChange = scene && groupIds.length > 0
            ? scene.blueprints.removeNodes(groupIds)
            : undefined;
        this.trackSceneChange(blueprintChange);

        //对每个分组图层进行解组
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];
        const delPrev: IDelOperateData[] = [];

        const relatedLayerIds: Set<string> = new Set();
        groupIds.forEach((id) => {
            const groupLayer = layerConfigs[id];
            if (groupLayer.next)
                relatedLayerIds.add(groupLayer.next);
            if (groupLayer.prev)
                relatedLayerIds.add(groupLayer.prev);
            if (groupLayer.pid)
                relatedLayerIds.add(groupLayer.pid);
            if (groupLayer.childHeader) {
                let childLayer = layerConfigs[groupLayer.childHeader];
                if (childLayer)
                    relatedLayerIds.add(childLayer.id!)
                while (childLayer?.next) {
                    childLayer = layerConfigs[childLayer.next];
                    if (childLayer)
                        relatedLayerIds.add(childLayer.id!)
                }
            }
        });

        //记录操作前状态
        updPrev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail});
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            if (layer) {
                const {prev, next, pid, childHeader, childTail} = layer;
                updPrev.push({id, prev, next, pid, childHeader, childTail});
            }
        });
        groupIds.forEach((id) => {
            delPrev.push({id, layerConfig: cloneDeep(layerConfigs[id])})
        })

        //修改数据
        runInAction(() => {
            groupIds.forEach((groupId: string) => {
                const layer = layerConfigs[groupId];
                const prevLayer = layer.prev ? layerConfigs[layer.prev] : undefined;
                const nextLayer = layer.next ? layerConfigs[layer.next] : undefined;
                const parentLayer = layer.pid ? layerConfigs[layer.pid] : undefined;
                const childHeaderLayer = layer.childHeader ? layerConfigs[layer.childHeader] : undefined;
                const childTailLayer = layer.childTail ? layerConfigs[layer.childTail] : undefined;
                //分组下是否有子图层
                const hasChild = childHeaderLayer && childTailLayer;
                const newHeaderId = hasChild ? childHeaderLayer?.id : nextLayer?.id;
                const newTailId = hasChild ? childTailLayer?.id : prevLayer?.id;

                if (parentLayer?.childHeader === groupId)
                    parentLayer.childHeader = newHeaderId;
                if (parentLayer?.childTail === groupId)
                    parentLayer.childTail = newTailId;

                if (groupId === layerManager.layerHeader)
                    layerManager.layerHeader = newHeaderId;
                if (groupId === layerManager.layerTail)
                    layerManager.layerTail = newTailId;

                if (hasChild) {
                    // 将子图层重新接回父链表，避免父分组还指向已删除的 group 节点。
                    childHeaderLayer && (childHeaderLayer.prev = prevLayer?.id)
                    childTailLayer && (childTailLayer.next = nextLayer?.id)
                    prevLayer && (prevLayer.next = childHeaderLayer?.id)
                    nextLayer && (nextLayer.prev = childTailLayer?.id)

                    let childNext = layer.childHeader;
                    while (childNext) {
                        const childLayer = layerConfigs[childNext];
                        childLayer && (childLayer.pid = layer.pid)
                        childNext = childLayer?.next;
                    }
                } else {
                    prevLayer && (prevLayer.next = nextLayer?.id)
                    nextLayer && (nextLayer.prev = prevLayer?.id)
                }
            });
        });

        //记录操作后数据
        updNext.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail});
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {prev, next, pid, childHeader, childTail} = layer;
            updNext.push({id, prev, next, pid, childHeader, childTail});
        });

        delItem(groupIds);

        const actions: IHistoryRecord[] = [
            {type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext},
            {type: OperateType.DEL, prev: delPrev, next: null}
        ];
        this.captureHistory({actions}, blueprintChange);
        //清空组件选中状态
        setTargetIds([]);
        //处理右侧设置项，如果为当前选中的分组图层，则卸载该设置项（因为分组图层已经被删除）
        if (groupIds.length) this.options.eventOperateStore.emitInspectorChange({kind: 'targets-deleted', ids: groupIds});
    }

    public doRemoveFromGroup() {
        const {targetIds} = this.options.eventOperateStore;
        if (targetIds.length === 0)
            return;
        //筛选出目标图层
        const {layerManager} = this.readLegacyModel()!;
        const {layerConfigs} = layerManager;
        const finalTargetIds = targetIds.filter(id => {
            const layer = layerConfigs[id];
            return layer.pid && !targetIds.includes(layer.pid)
        })

        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];

        //计算关联图层id
        const relateIds = new Set<string>();
        relateIds.add(layerManager.layerHeader!);
        finalTargetIds.forEach(id => {
            const layer = layerConfigs[id];
            const parent = layerConfigs[layer.pid!];
            relateIds.add(layer.id!)
            if (layer.prev)
                relateIds.add(layer.prev)
            if (layer.next)
                relateIds.add(layer.next)
            if (parent.childHeader === id || parent.childTail === id)
                relateIds.add(parent.id!)
        })

        //记录数据变更前状态
        updPrev.push({layerHeader: layerManager.layerHeader!, layerTail: layerManager.layerTail!})
        relateIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {prev, next, pid, childHeader, childTail} = layer;
            updPrev.push({id, prev, next, pid, childHeader, childTail});
        });

        //修改数据
        runInAction(() => {
            finalTargetIds.forEach(id => {
                const layer = layerConfigs[id];
                const prevLayer = layerConfigs[layer.prev!];
                const nextLayer = layerConfigs[layer.next!];
                const parentLayer = layerConfigs[layer.pid!];
                const oldHeaderLayer = layerConfigs[layerManager.layerHeader!];

                if (parentLayer.childHeader === id)
                    parentLayer.childHeader = nextLayer?.id;
                if (parentLayer.childTail === id)
                    parentLayer.childTail = prevLayer?.id;

                layer.pid = undefined;
                layer.prev = undefined;
                layer.next = layerManager.layerHeader;
                oldHeaderLayer.prev = layer.id;
                layerManager.layerHeader = layer.id;

                prevLayer && (prevLayer.next = nextLayer?.id)
                nextLayer && (nextLayer.prev = prevLayer?.id)
            })
        })

        //记录数据变更后状态
        updNext.push({layerHeader: layerManager.layerHeader!, layerTail: layerManager.layerTail!})
        relateIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {prev, next, pid, childHeader, childTail} = layer;
            updNext.push({id, prev, next, pid, childHeader, childTail});
        });

        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}]});
        layerManager.reRenderLayer();
    }

    /**
     * 将source图层移动到target图层前后
     * @param sourceId
     * @param targetId
     * @param position
     */
    public layerDragMove(sourceId: string, targetId: string, position: LayerDragPosition = 'before') {
        if (!sourceId || !targetId || sourceId === targetId)
            return;
        const {layerManager} = this.readLegacyModel()!;
        if (LayerUtil.isTargetChild(targetId, sourceId, layerManager.layerConfigs))
            return;
        const {layerConfigs} = layerManager;
        const sourceLayer = layerConfigs[sourceId];
        const targetLayer = layerConfigs[targetId];
        if (!sourceLayer || !targetLayer)
            return;
        const sourcePrevId = sourceLayer.prev;
        const sourceNextId = sourceLayer.next;
        const targetPrevId = targetLayer.prev;
        const targetNextId = targetLayer.next;
        const sourceParentId = sourceLayer.pid;
        const targetParentId = targetLayer.pid;
        const sourceParentLayer = sourceParentId ? layerConfigs[sourceParentId] : undefined;
        const targetParentLayer = targetParentId ? layerConfigs[targetParentId] : undefined;

        if (position === 'before' && sourceNextId === targetId)
            return;
        if (position === 'after' && sourcePrevId === targetId)
            return;

        //对每个分组图层进行解组
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];

        const relatedLayerIds: Set<string> = new Set([sourceId, targetId]);
        [sourceId, targetId, sourcePrevId, sourceNextId, targetPrevId, targetNextId, sourceParentId, targetParentId].forEach((id) => {
            if (!id)
                return;
            const layer = layerConfigs[id];
            if (!layer)
                return;
            layer.next && relatedLayerIds.add(layer.next);
            layer.prev && relatedLayerIds.add(layer.prev);
            layer.pid && relatedLayerIds.add(layer.pid);
        });

        //记录操作前状态
        updPrev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail});
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {prev, next, pid, childHeader, childTail} = layer;
            updPrev.push({id, prev, next, pid, childHeader, childTail});
        });

        runInAction(() => {
            // 先把 source 从原链表摘掉。
            if (sourcePrevId) {
                layerConfigs[sourcePrevId].next = sourceNextId;
            } else if (sourceParentLayer) {
                sourceParentLayer.childHeader = sourceNextId;
            } else {
                layerManager.layerHeader = sourceNextId;
            }

            if (sourceNextId) {
                layerConfigs[sourceNextId].prev = sourcePrevId;
            } else if (sourceParentLayer) {
                sourceParentLayer.childTail = sourcePrevId;
            } else {
                layerManager.layerTail = sourcePrevId;
            }

            // 再插入到 target 前后，并继承 target 当前所在的父级。
            sourceLayer.pid = targetParentId;
            if (position === 'before') {
                sourceLayer.prev = targetPrevId;
                sourceLayer.next = targetId;
                targetLayer.prev = sourceId;

                if (targetPrevId) {
                    layerConfigs[targetPrevId].next = sourceId;
                } else if (targetParentLayer) {
                    targetParentLayer.childHeader = sourceId;
                } else {
                    layerManager.layerHeader = sourceId;
                }
            } else {
                sourceLayer.prev = targetId;
                sourceLayer.next = targetNextId;
                targetLayer.next = sourceId;

                if (targetNextId) {
                    layerConfigs[targetNextId].prev = sourceId;
                } else if (targetParentLayer) {
                    targetParentLayer.childTail = sourceId;
                } else {
                    layerManager.layerTail = sourceId;
                }
            }
        })

        //记录操作后数据
        updNext.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail});
        relatedLayerIds.forEach((id) => {
            const layer = layerConfigs[id];
            const {prev, next, pid, childHeader, childTail} = layer;
            updNext.push({id, prev, next, pid, childHeader, childTail});
        });
        const actions: IHistoryRecord[] = [{type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}];
        this.captureHistory({actions});

        layerManager.reRenderLayer();
    }

    /**
     * 组内上对其
     */
    public groupTopAligned() {
        //日志记录
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];

        const {targetIds, setTargetIds} = this.options.eventOperateStore;

        const {layerManager} = this.readLegacyModel()!;
        //记录变更前数据
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            updPrev.push({id, y: layer.y});
        });

        //变更数据
        const coordinate = CoordinateUtil.calculateGroupRect(targetIds, layerManager.layerConfigs);
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            layer.y = coordinate.minY;
        });

        //记录变更后的数据
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            updNext.push({id, y: layer.y});
        });

        //写入日志
        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}]});

        //重新选中最新位置的包围盒
        setTargetIds([]);
        this.afterCurrentScene(() => setTargetIds(targetIds));
        layerManager.reRenderLayer();
    }

    /**
     * 组内下对齐
     */
    public groupBottomAligned() {
        //日志记录
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];

        const {targetIds, setTargetIds} = this.options.eventOperateStore;
        const {layerManager} = this.readLegacyModel()!;
        //记录变更前数据
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            updPrev.push({id, y: layer.y});
        });

        const coordinate = CoordinateUtil.calculateGroupRectLT(targetIds, layerManager.layerConfigs);
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            layer.y = coordinate.maxY;
        });

        //记录变更后的数据
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            updNext.push({id, y: layer.y});
        });

        //写入日志
        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}]});

        //重新选中最新位置的包围盒
        setTargetIds([]);
        this.afterCurrentScene(() => setTargetIds(targetIds));
        layerManager.reRenderLayer();
    }

    /**
     * 组内左对齐
     */
    public groupLeftAligned() {
        //日志记录
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];

        const {targetIds, setTargetIds} = this.options.eventOperateStore;
        const {layerManager} = this.readLegacyModel()!;
        //记录变更前数据
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            updPrev.push({id, x: layer.x});
        });

        const coordinate = CoordinateUtil.calculateGroupRect(targetIds, layerManager.layerConfigs);
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            layer.x = coordinate.minX;
        });

        //记录变更后的数据
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            updNext.push({id, x: layer.x});
        });

        //写入日志
        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}]});

        //重新选中最新位置的包围盒
        setTargetIds([]);
        this.afterCurrentScene(() => setTargetIds(targetIds));
        layerManager.reRenderLayer();
    }

    /**
     * 组内右对齐
     */
    public groupRightAligned() {
        //日志记录
        const updPrev: IUpdLayerOperateData[] = [];
        const updNext: IUpdLayerOperateData[] = [];

        const {targetIds, setTargetIds} = this.options.eventOperateStore;
        const {layerManager} = this.readLegacyModel()!;
        //记录变更前数据
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            updPrev.push({id, x: layer.x});
        });

        const coordinate = CoordinateUtil.calculateGroupRectLT(targetIds, layerManager.layerConfigs);
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            layer.x = coordinate.maxX;
        });

        //记录变更后的数据
        targetIds.forEach(id => {
            const layer = layerManager.layerConfigs[id];
            updNext.push({id, x: layer.x});
        });

        //写入日志
        this.captureHistory({actions: [{type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext}]});

        //重新选中最新位置的包围盒
        setTargetIds([]);
        this.afterCurrentScene(() => setTargetIds(targetIds));
        layerManager.reRenderLayer();
    }

}

