/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {cloneDeep, isEqual, merge} from 'lodash';
import {runInAction} from 'mobx';
import type {DesignerSceneLayerPatch, DesignerSceneLayerSnapshot, DesignerSceneLayers, DesignerLayerModelChangedEvent} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {DesignerSceneBlueprints, SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {ILayerItem, IThemeItem} from '@datavisool/sdk/types';
import {buildLayerTree} from '@/shared/designer/buildLayerTree.ts';
import type DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import componentDataGvParser from '@/plugins/designer-runtime/internal/designer/left/global-variable/parse/ComponentDataGvParser.ts';

type RecordValue = Record<string, unknown>;
type PatchResult = {readonly ok: true; readonly value: unknown} | {readonly ok: false};
type Controller = {
    config: RecordValue | null;
    getConfig(): RecordValue | null;
    update(config: RecordValue, options?: {reRender?: boolean}): void;
    changeData?(value: unknown): void;
    updateFilter?(filter: RecordValue | undefined): void;
    updateTheme?(theme: IThemeItem): void;
};

function isRecord(value: unknown): value is RecordValue {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Replays only changed fields; untouched fields keep their latest live values. */
function applyDelta(current: unknown, expected: unknown, target: unknown): PatchResult {
    if (isEqual(expected, target)) return {ok: true, value: current};
    if (isRecord(expected) && isRecord(target)) {
        if (!isRecord(current)) return {ok: false};
        const result = cloneDeep(current);
        for (const key of new Set([...Object.keys(expected), ...Object.keys(target)])) {
            const hasExpected = Object.prototype.hasOwnProperty.call(expected, key);
            const hasTarget = Object.prototype.hasOwnProperty.call(target, key);
            const hasCurrent = Object.prototype.hasOwnProperty.call(result, key);
            if (hasExpected === hasTarget && isEqual(expected[key], target[key])) continue;
            if (hasExpected && !hasTarget) {
                if (!hasCurrent || !isEqual(result[key], expected[key])) return {ok: false};
                delete result[key];
                continue;
            }
            if (!hasExpected && hasTarget) {
                if (hasCurrent) return {ok: false};
                result[key] = cloneDeep(target[key]);
                continue;
            }
            if (!hasExpected || !hasTarget || !hasCurrent) return {ok: false};
            const nested = applyDelta(result[key], expected[key], target[key]);
            if (!nested.ok) return nested;
            result[key] = nested.value;
        }
        return {ok: true, value: result};
    }
    return isEqual(current, expected) ? {ok: true, value: cloneDeep(target)} : {ok: false};
}

function applySnapshotDelta(
    current: DesignerSceneLayerSnapshot,
    expected: DesignerSceneLayerSnapshot,
    target: DesignerSceneLayerSnapshot,
): DesignerSceneLayerSnapshot | undefined {
    if (current.sceneIdentity !== expected.sceneIdentity || target.sceneIdentity !== expected.sceneIdentity
        || current.sceneVersion !== expected.sceneVersion || target.sceneVersion !== expected.sceneVersion) return;
    const currentLayers = {...current.layers};
    const currentConfigs = {...current.configs};
    const expectedLayers = {...expected.layers};
    const expectedConfigs = {...expected.configs};
    const targetLayers = {...target.layers};
    const targetConfigs = {...target.configs};
    // Entity membership includes the controller configuration generated after mount.
    // The caller guards the scene, render generation and controller before replaying it.
    for (const id of new Set([...Object.keys(expectedLayers), ...Object.keys(targetLayers)])) {
        const existed = Object.hasOwn(expectedLayers, id);
        const exists = Object.hasOwn(targetLayers, id);
        if (existed === exists) continue;
        if (Object.hasOwn(currentLayers, id) !== existed) return;
        if (exists) {
            currentLayers[id] = cloneDeep(targetLayers[id]);
            if (Object.hasOwn(targetConfigs, id)) currentConfigs[id] = cloneDeep(targetConfigs[id]);
            else delete currentConfigs[id];
        } else {
            delete currentLayers[id];
            delete currentConfigs[id];
        }
        delete expectedLayers[id];
        delete targetLayers[id];
        delete expectedConfigs[id];
        delete targetConfigs[id];
    }
    const layers = applyDelta(currentLayers, expectedLayers, targetLayers);
    const configs = applyDelta(currentConfigs, expectedConfigs, targetConfigs);
    const canvas = applyDelta(current.canvas, expected.canvas, target.canvas);
    const layerHeader = applyDelta(current.layerHeader, expected.layerHeader, target.layerHeader);
    const layerTail = applyDelta(current.layerTail, expected.layerTail, target.layerTail);
    if (!layers.ok || !configs.ok || !canvas.ok || !layerHeader.ok || !layerTail.ok) return;
    return {
        sceneIdentity: current.sceneIdentity,
        sceneVersion: current.sceneVersion,
        canvas: canvas.value as DesignerSceneLayerSnapshot['canvas'],
        layerHeader: layerHeader.value as string | undefined,
        layerTail: layerTail.value as string | undefined,
        layers: layers.value as DesignerSceneLayerSnapshot['layers'],
        configs: configs.value as DesignerSceneLayerSnapshot['configs'],
    };
}

function listLayerIds(layers: Readonly<Record<string, unknown>>): string[] {
    return Object.keys(layers);
}

function changedIds(before: DesignerSceneLayerSnapshot, after: DesignerSceneLayerSnapshot): string[] {
    const ids = new Set([...listLayerIds(before.layers), ...listLayerIds(after.layers), ...Object.keys(before.configs), ...Object.keys(after.configs)]);
    const changed = [...ids].filter(id => !isEqual(before.layers[id], after.layers[id]) || !isEqual(before.configs[id], after.configs[id]));
    return changed.length ? changed : [...new Set([before.layerHeader, after.layerHeader, before.layerTail, after.layerTail].filter((id): id is string => Boolean(id)))];
}

function snapshotFromManager(manager: DesignerManager, sceneIdentity: object, sceneVersion: number): DesignerSceneLayerSnapshot {
    const persisted = manager.layerManager.getData();
    const snapshot = cloneDeep({
        sceneVersion,
        canvas: manager.canvasManager.getData(),
        layerHeader: manager.layerManager.layerHeader,
        layerTail: manager.layerManager.layerTail,
        layers: persisted.layerConfigs ?? {},
        configs: persisted.elemConfigs ?? {},
    });
    return {...snapshot, sceneIdentity};
}

function validateSnapshot(
    snapshot: Omit<DesignerSceneLayerSnapshot, 'sceneIdentity' | 'sceneVersion'>,
    sceneIdentity: object,
    sceneVersion: number,
): DesignerSceneLayerSnapshot | undefined {
    if (!snapshot || !isRecord(snapshot.layers) || !isRecord(snapshot.configs) || !isRecord(snapshot.canvas)) return;
    const layers = snapshot.layers as Record<string, RecordValue>;
    for (const [id, layer] of Object.entries(layers)) {
        if (!id || !isRecord(layer) || layer.id !== id) return;
    }
    if (snapshot.layerHeader && !layers[snapshot.layerHeader]) return;
    if (snapshot.layerTail && !layers[snapshot.layerTail]) return;
    return {...cloneDeep({...snapshot, sceneVersion}), sceneIdentity} as DesignerSceneLayerSnapshot;
}

function collectSubtreeIds(layers: Readonly<Record<string, Readonly<Record<string, unknown>>>>, ids: readonly string[]): string[] {
    const result = new Set(ids);
    let changed = true;
    while (changed) {
        changed = false;
        Object.values(layers).forEach(layer => {
            if (typeof layer.id === 'string' && typeof layer.pid === 'string' && result.has(layer.pid) && !result.has(layer.id)) {
                result.add(layer.id);
                changed = true;
            }
        });
    }
    return [...result];
}

function rebuildLayerLinks(snapshot: DesignerSceneLayerSnapshot): DesignerSceneLayerSnapshot {
    const layers = cloneDeep(snapshot.layers) as Record<string, RecordValue>;
    const originalLayers = snapshot.layers as Readonly<Record<string, RecordValue>>;
    Object.values(layers).forEach(layer => {
        if (layer.type === 'group') {
            layer.childHeader = undefined;
            layer.childTail = undefined;
        }
    });
    const byParent = new Map<string | undefined, string[]>();
    Object.values(layers).forEach(layer => {
        const parentId = typeof layer.pid === 'string' && layers[layer.pid] ? layer.pid : undefined;
        const siblings = byParent.get(parentId) ?? [];
        if (typeof layer.id === 'string') siblings.push(layer.id);
        byParent.set(parentId, siblings);
    });
    const orderByChain = (header: string | undefined, parentId: string | undefined, fallback: string[]) => {
        const output: string[] = [];
        const visited = new Set<string>();
        let id = header;
        while (id && originalLayers[id] && !visited.has(id)) {
            visited.add(id);
            if (layers[id] && (typeof originalLayers[id].pid === 'string' ? originalLayers[id].pid : undefined) === parentId)
                output.push(id);
            id = typeof originalLayers[id].next === 'string' ? originalLayers[id].next as string : undefined;
        }
        fallback.forEach(item => { if (!output.includes(item)) output.push(item); });
        return output;
    };
    let layerHeader: string | undefined;
    let layerTail: string | undefined;
    byParent.forEach((unordered, parentId) => {
        const header = parentId ? originalLayers[parentId]?.childHeader as string | undefined : snapshot.layerHeader;
        const ordered = orderByChain(header, parentId, unordered.sort((left, right) => Number(layers[left]?.order ?? 0) - Number(layers[right]?.order ?? 0)));
        ordered.forEach((id, index) => {
            layers[id].prev = ordered[index - 1];
            layers[id].next = ordered[index + 1];
        });
        if (parentId) {
            layers[parentId].childHeader = ordered[0];
            layers[parentId].childTail = ordered.at(-1);
        } else {
            layerHeader = ordered[0];
            layerTail = ordered.at(-1);
        }
    });
    return {...snapshot, layers, layerHeader, layerTail};
}

interface LayerIdentity {
    readonly exists: boolean;
    readonly renderKey: string;
    readonly entityToken?: object;
    readonly controller?: Controller;
}

/** Runtime-owned bridge over the legacy layer manager. Public callers only see detached DTOs and guarded history. */
export function createSceneLayers(options: {
    manager: DesignerManager;
    sceneIdentity: object;
    sceneVersion: number;
    isActive(): boolean;
    canWrite(): boolean;
    blueprints: DesignerSceneBlueprints;
    emitChanged(event: DesignerLayerModelChangedEvent): void;
}): DesignerSceneLayers {
    const {manager, sceneIdentity, sceneVersion, blueprints, emitChanged} = options;
    const managerStore = manager.runtimeContext?.managerStore;
    const layerManager = manager.layerManager;
    const variableOwner = manager.variableOwner ?? manager;
    let bindGeneration = 0;
    const bindingTimers = new Set<ReturnType<typeof setTimeout>>();
    let disposed = false;
    const isActive = () => !disposed && options.isActive() && managerStore?.currentManager === manager && managerStore.sceneVersion === sceneVersion;
    const read = (): DesignerSceneLayerSnapshot | undefined => isActive() ? snapshotFromManager(manager, sceneIdentity, sceneVersion) : undefined;
    const readCurrent = () => snapshotFromManager(manager, sceneIdentity, sceneVersion);
    const notify = (ids: readonly string[], before: DesignerSceneLayerSnapshot, after: DesignerSceneLayerSnapshot) => {
        if (!isActive()) return;
        const onlyNameChanged = ids.length === 1 && isEqual(
            {...before.layers[ids[0]], name: undefined},
            {...after.layers[ids[0]], name: undefined},
        ) && isEqual(before.configs[ids[0]], after.configs[ids[0]]) && isEqual(before.canvas, after.canvas);
        const event = Object.freeze({sceneIdentity, sceneVersion, kind: onlyNameChanged ? 'rename' as const : 'changed' as const, ids: Object.freeze([...ids])});
        try { emitChanged(event); } catch (error) { console.error('发布图层模型变更失败', error); }
    };
    const renderedIds = (snapshot: DesignerSceneLayerSnapshot) => {
        const rendered = new Set<string>();
        const collect = (layers: readonly ILayerItem[]) => layers.forEach(layer => {
            if (!layer.id) return;
            rendered.add(layer.id);
            if (layer.type === 'group' && layer.children) collect(layer.children);
        });
        collect(buildLayerTree(snapshot.layers as Readonly<Record<string, ILayerItem>>, snapshot.layerHeader));
        return rendered;
    };
    const captureIdentities = (
        ids: readonly string[],
        snapshot: DesignerSceneLayerSnapshot,
    ): Map<string, LayerIdentity> => {
        const rendered = renderedIds(snapshot);
        return new Map(ids.map(id => [id, {
            exists: Object.prototype.hasOwnProperty.call(layerManager.layerConfigs, id),
            renderKey: layerManager.getRenderKey(id),
            entityToken: layerManager.getRuntimeEntityToken(id),
            // A disconnected view is unmounted after model replay; its outgoing
            // controller cannot identify the target state of this history entry.
            controller: rendered.has(id) ? layerManager.controllers[id] as Controller | undefined : undefined,
        }]));
    };
    const entityTokens = (identities: ReadonlyMap<string, LayerIdentity>) =>
        new Map([...identities].map(([id, identity]) => [id, identity.entityToken]));
    const identitiesMatch = (expected: ReadonlyMap<string, LayerIdentity>) => [...expected].every(([id, identity]) => {
        if (identity.exists !== Object.prototype.hasOwnProperty.call(layerManager.layerConfigs, id)) return false;
        if (identity.entityToken !== layerManager.getRuntimeEntityToken(id)) return false;
        const controller = layerManager.controllers[id];
        const continuation = Boolean(identity.controller && controller
            && layerManager.isControllerContinuation(id, identity.controller, controller));
        if (identity.renderKey !== layerManager.getRenderKey(id) && identity.controller && !continuation) return false;
        return !identity.controller || controller === identity.controller || continuation;
    });

    const scheduleBindings = (ids: readonly string[]) => {
        if (!ids.length) return;
        const generation = ++bindGeneration;
        let attempts = 0;
        const bindWhenReady = () => {
            if (!isActive() || !options.canWrite() || generation !== bindGeneration) return;
            const pending = ids.filter(id => layerManager.layerConfigs[id] && !layerManager.controllers[id]);
            const ready = ids.filter(id => layerManager.layerConfigs[id] && layerManager.controllers[id]);
            ready.forEach(id => {
                const controller = layerManager.controllers[id];
                if (controller) componentDataGvParser.bindConfigToGv(controller, variableOwner);
            });
            if (pending.length && attempts++ < 20) {
                const timer = setTimeout(() => {
                    bindingTimers.delete(timer);
                    bindWhenReady();
                }, 50);
                bindingTimers.add(timer);
            }
        };
        bindWhenReady();
    };

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        bindGeneration += 1;
        bindingTimers.forEach(timer => clearTimeout(timer));
        bindingTimers.clear();
    };

    const applySnapshot = (
        expected: DesignerSceneLayerSnapshot,
        next: DesignerSceneLayerSnapshot,
        applyOptions: {readonly reRender?: boolean} = {},
        allowPaused = false,
        historyEntityTokens?: ReadonlyMap<string, object | undefined>,
    ): boolean => {
        if (!isActive() || (!allowPaused && !options.canWrite())
            || expected.sceneIdentity !== sceneIdentity || next.sceneIdentity !== sceneIdentity) return false;
        const current = readCurrent();
        if (!isEqual(current, expected)) return false;
        const validated = validateSnapshot(next, sceneIdentity, sceneVersion);
        if (!validated) return false;
        const ids = changedIds(current, validated);
        if (!ids.length) return true;
        const entityTokensBefore = new Map(ids.map(id => [id, layerManager.getRuntimeEntityToken(id)]));
        const configIds = ids.filter(id => !isEqual(current.configs[id], validated.configs[id]));
        const removeOrReplace = ids.filter(id => Boolean(current.layers[id]) && (!validated.layers[id]
            || current.layers[id].type !== validated.layers[id].type));
        if (configIds.length || removeOrReplace.length) bindGeneration += 1;
        try {
            if (configIds.length || removeOrReplace.length)
                componentDataGvParser.unbindFromGv([...new Set([...configIds, ...removeOrReplace])], variableOwner);
            runInAction(() => {
                if (removeOrReplace.length) layerManager.delItem(removeOrReplace);
                layerManager.layerConfigs = cloneDeep(validated.layers) as typeof layerManager.layerConfigs;
                layerManager.elemConfigs = cloneDeep(validated.configs) as typeof layerManager.elemConfigs;
                layerManager.layerHeader = validated.layerHeader;
                layerManager.layerTail = validated.layerTail;
                const addOrReplace = ids.filter(id => Boolean(validated.layers[id]) && (!current.layers[id]
                    || current.layers[id].type !== validated.layers[id].type));
                addOrReplace.forEach(id => layerManager.addItem(cloneDeep(validated.layers[id]) as any));
                if (historyEntityTokens && !layerManager.restoreRuntimeHistoryEntityTokens(historyEntityTokens))
                    throw new Error('图层历史实体身份与目标快照不匹配。');
            });
            const addOrReplace = ids.filter(id => Boolean(validated.layers[id]) && (!current.layers[id]
                || current.layers[id].type !== validated.layers[id].type));
            configIds.forEach(id => {
                if (!validated.layers[id] || removeOrReplace.includes(id)) return;
                const controller = layerManager.controllers[id] as Controller | undefined;
                const config = validated.configs[id];
                if (!controller || !isRecord(config)) return;
                controller.config = cloneDeep(config);
                controller.update(cloneDeep(config), {reRender: applyOptions.reRender ?? true});
                if (applyOptions.reRender !== false) {
                    const previousConfig = current.configs[id];
                    const previousData = isRecord(previousConfig) ? previousConfig.data : undefined;
                    const previousFilter = isRecord(previousConfig) ? previousConfig.filter : undefined;
                    if (isRecord(config.data) && !isEqual(previousData, config.data))
                        controller.changeData?.(cloneDeep(config.data.value));
                    if (!isEqual(previousFilter, config.filter))
                        controller.updateFilter?.(isRecord(config.filter) ? cloneDeep(config.filter) : undefined);
                }
            });
            if (!isEqual(current.canvas, validated.canvas))
                manager.canvasManager.updateCanvasConfig(cloneDeep(validated.canvas) as any);
            layerManager.reRenderLayer();
            const bindable = [...new Set([...configIds, ...addOrReplace])].filter(id => Boolean(validated.layers[id]));
            const immediatelyReady = bindable.filter(id => layerManager.controllers[id]);
            immediatelyReady.forEach(id => {
                const controller = layerManager.controllers[id];
                if (controller) componentDataGvParser.bindConfigToGv(controller, variableOwner);
            });
            scheduleBindings(bindable.filter(id => !layerManager.controllers[id]));
            return isActive();
        } catch (error) {
            // Restore model DTOs even when a legacy controller update fails partway through.
            const rollbackErrors: unknown[] = [];
            const restore = (action: () => void) => {
                try { action(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
            };
            bindGeneration += 1;
            bindingTimers.forEach(timer => clearTimeout(timer));
            bindingTimers.clear();
            const currentIds = [...new Set([...Object.keys(layerManager.layerConfigs), ...Object.keys(current.layers)])];
            const restoreIds = currentIds.filter(id => !current.layers[id] || !layerManager.layerConfigs[id]
                || current.layers[id].type !== layerManager.layerConfigs[id]?.type);
            restore(() => runInAction(() => {
                restoreIds.forEach(id => restore(() => layerManager.delItem([id])));
                layerManager.layerConfigs = cloneDeep(current.layers) as typeof layerManager.layerConfigs;
                layerManager.elemConfigs = cloneDeep(current.configs) as typeof layerManager.elemConfigs;
                layerManager.layerHeader = current.layerHeader;
                layerManager.layerTail = current.layerTail;
                restoreIds.forEach(id => {
                    if (current.layers[id]) restore(() => layerManager.addItem(cloneDeep(current.layers[id]) as any));
                });
                restore(() => {
                    if (!layerManager.restoreRuntimeHistoryEntityTokens(entityTokensBefore))
                        throw new Error('回滚图层历史实体身份失败。');
                });
            }));
            Object.keys(current.configs).forEach(id => {
                const controller = layerManager.controllers[id] as Controller | undefined;
                const config = current.configs[id];
                if (!controller || !isRecord(config)) return;
                restore(() => { controller.config = cloneDeep(config); });
                restore(() => controller.update(cloneDeep(config), {reRender: true}));
                const data = config.data;
                if (isRecord(data)) restore(() => controller.changeData?.(cloneDeep(data.value)));
                restore(() => controller.updateFilter?.(isRecord(config.filter) ? cloneDeep(config.filter) : undefined));
            });
            if (!isEqual(validated.canvas, current.canvas))
                restore(() => manager.canvasManager.updateCanvasConfig(cloneDeep(current.canvas) as any));
            restore(() => layerManager.reRenderLayer());
            Object.keys(current.configs).forEach(id => {
                const controller = layerManager.controllers[id];
                if (controller) restore(() => componentDataGvParser.bindConfigToGv(controller, variableOwner));
            });
            restore(() => scheduleBindings(Object.keys(current.configs).filter(id => !layerManager.controllers[id])));
            if (rollbackErrors.length)
                throw new AggregateError([error, ...rollbackErrors], '图层修改失败，且未能完整回滚。');
            throw error;
        }
    };

    const createChange = (
        before: DesignerSceneLayerSnapshot,
        after: DesignerSceneLayerSnapshot,
        affectedIds: readonly string[],
        removeBlueprintNodes: readonly string[] = [],
        applyOptions: {readonly reRender?: boolean} = {},
    ): SceneModelChange | undefined => {
        if (!isActive() || !options.canWrite() || isEqual(before, after)) return;
        const ids = Object.freeze([...new Set(affectedIds)]);
        const historyBeforeIdentity = captureIdentities(ids, before);
        if (!applySnapshot(before, after, applyOptions)) return;
        const historyAfterIdentity = captureIdentities(ids, after);
        let blueprintChange: SceneModelChange | undefined;
        try {
            if (removeBlueprintNodes.length) blueprintChange = blueprints.removeNodes(removeBlueprintNodes);
            if (!isActive() || !options.canWrite()) throw Object.assign(new Error('图层场景已失效。'), {name: 'AbortError'});
        } catch (error) {
            const applied = readCurrent();
            if (applied) applySnapshot(applied, before, {}, false, entityTokens(historyBeforeIdentity));
            throw error;
        }
        let historyBefore = before;
        let historyAfter = after;
        let undoIdentity = historyAfterIdentity;
        let redoIdentity: Map<string, LayerIdentity> | undefined;
        const applyReplay = (
            expected: DesignerSceneLayerSnapshot,
            target: DesignerSceneLayerSnapshot,
            identities: ReadonlyMap<string, LayerIdentity>,
            targetIdentities: ReadonlyMap<string, LayerIdentity>,
            allowPaused = false,
        ) => {
            if (!isActive() || (!allowPaused && !options.canWrite()) || !identitiesMatch(identities)) return;
            const current = readCurrent();
            const next = applySnapshotDelta(current, expected, target);
            if (!next || !applySnapshot(current, next, {}, allowPaused, entityTokens(targetIdentities))) return;
            return {before: current, after: next};
        };
        const undoChange = (allowPaused: boolean) => {
            if (!isActive() || (!allowPaused && !options.canWrite()) || !identitiesMatch(undoIdentity)) return false;
            if (blueprintChange && !(allowPaused ? blueprintChange.rollback() : blueprintChange.undo())) return false;
            const replay = applyReplay(historyAfter, historyBefore, undoIdentity, historyBeforeIdentity, allowPaused);
            if (!replay) {
                blueprintChange?.redo();
                return false;
            }
            // Keep initialized/default data for a later restoration of the same entity.
            historyAfter = replay.before;
            historyBefore = replay.after;
            redoIdentity = captureIdentities(ids, replay.after);
            notify(ids, replay.before, replay.after);
            return true;
        };
        notify(ids, before, after);
        return Object.freeze({
            sceneIdentity,
            sceneVersion,
            pageIds: Object.freeze([]),
            rollback: () => undoChange(true),
            undo: () => undoChange(false),
            redo: () => {
                if (!isActive() || !options.canWrite() || !redoIdentity || !identitiesMatch(redoIdentity)) return false;
                const replay = applyReplay(historyBefore, historyAfter, redoIdentity, historyAfterIdentity);
                if (!replay) return false;
                if (blueprintChange && !blueprintChange.redo()) {
                    const current = readCurrent();
                    const rolledBack = current && applySnapshotDelta(current, replay.after, replay.before);
                    if (current && rolledBack)
                        applySnapshot(current, rolledBack, {}, false, entityTokens(redoIdentity));
                    return false;
                }
                historyBefore = replay.before;
                historyAfter = replay.after;
                undoIdentity = captureIdentities(ids, replay.after);
                notify(ids, replay.before, replay.after);
                return true;
            },
        });
    };

    const layers: DesignerSceneLayers = {
        read,
        patch(expected, patches: readonly DesignerSceneLayerPatch[]) {
            const current = read();
                if (!current || expected.sceneIdentity !== sceneIdentity || expected.sceneVersion !== sceneVersion || !patches.length) return;
            const next = {...cloneDeep(current), sceneIdentity} as {sceneIdentity: object; sceneVersion: number; canvas: RecordValue; layerHeader?: string; layerTail?: string; layers: Record<string, RecordValue>; configs: Record<string, unknown>};
            const seen = new Set<string>();
            for (const patch of patches) {
                const {id} = patch;
                const expectedLayer = expected.layers[id];
                const currentLayer = current.layers[id];
                if (!id || seen.has(id) || !expectedLayer || !currentLayer) return;
                seen.add(id);
                for (const [key, value] of Object.entries(patch.layer ?? {})) {
                    if (!isEqual(currentLayer[key as keyof typeof currentLayer], expectedLayer[key as keyof typeof expectedLayer])) return;
                    if (key === 'id' && value !== id) return;
                }
                if (patch.layer) next.layers[id] = merge({}, currentLayer, cloneDeep(patch.layer), {id});
                if (patch.config) {
                    const expectedConfig = isRecord(expected.configs[id]) ? expected.configs[id] as RecordValue : {};
                    const currentConfig = isRecord(current.configs[id]) ? current.configs[id] as RecordValue : {};
                    for (const key of Object.keys(patch.config)) if (!isEqual(currentConfig[key], expectedConfig[key])) return;
                    next.configs[id] = merge({}, currentConfig, cloneDeep(patch.config), {base: {id}});
                }
            }
            return createChange(current, next as DesignerSceneLayerSnapshot, [...seen]);
        },
        remove(expected, ids) {
            const current = read();
            if (!current || expected.sceneIdentity !== sceneIdentity || expected.sceneVersion !== sceneVersion || !ids.length) return;
            const roots = [...new Set(ids)];
            if (!roots.length || roots.some(id => !expected.layers[id] || !current.layers[id])) return;
            const expectedSubtree = collectSubtreeIds(expected.layers as Record<string, Readonly<Record<string, unknown>>>, roots);
            const currentSubtree = collectSubtreeIds(current.layers as Record<string, Readonly<Record<string, unknown>>>, roots);
            if (!isEqual([...expectedSubtree].sort(), [...currentSubtree].sort())) return;
            if (expectedSubtree.some(id => !isEqual(expected.layers[id], current.layers[id])
                || !isEqual(expected.configs[id], current.configs[id]))) return;
            const removed = collectSubtreeIds(current.layers as Record<string, Readonly<Record<string, unknown>>>, roots);
            const next = {...cloneDeep(current), sceneIdentity} as {sceneIdentity: object; sceneVersion: number; canvas: RecordValue; layerHeader?: string; layerTail?: string; layers: Record<string, RecordValue>; configs: Record<string, unknown>};
            removed.forEach(id => { delete next.layers[id]; delete next.configs[id]; });
            const linked = rebuildLayerLinks(next as DesignerSceneLayerSnapshot);
            return createChange(current, linked, removed, removed);
        },
        replace(expected, input, applyOptions) {
            const current = read();
            if (!current || expected.sceneIdentity !== sceneIdentity || expected.sceneVersion !== sceneVersion || !isEqual(current, expected)) return;
            const next = validateSnapshot(input, sceneIdentity, sceneVersion);
            if (!next) return;
            const deleted = Object.keys(current.layers).filter(id => !next.layers[id]);
            return createChange(current, next, changedIds(current, next), deleted, applyOptions);
        },
        applyTheme(id, theme) {
            const before = read();
            const controller = layerManager.controllers[id] as Controller | undefined;
            const config = before?.configs[id];
            if (!before || !options.canWrite() || !before.layers[id] || !isRecord(config)
                || !controller?.updateTheme || !theme) return;
            let themed: RecordValue | null;
            try {
                controller.updateTheme(cloneDeep(theme));
                themed = cloneDeep(controller.getConfig());
            } finally {
                controller.config = cloneDeep(config);
                controller.update(cloneDeep(config), {reRender: true});
            }
            if (!themed) return;
            const next = {...cloneDeep(before), sceneIdentity};
            const nextConfig = cloneDeep(config);
            if (Object.prototype.hasOwnProperty.call(themed, 'style')) nextConfig.style = cloneDeep(themed.style);
            else delete nextConfig.style;
            next.configs = {...next.configs, [id]: nextConfig};
            return createChange(before, next, [id]);
        },
        updateBaseTextContent(expected, id, value) {
            const current = read();
            if (!current || !id || expected.sceneIdentity !== sceneIdentity || expected.sceneVersion !== sceneVersion || !expected.layers[id] || !current.layers[id]) return;
            const expectedConfig = expected.configs[id];
            const currentConfig = current.configs[id];
            if (!isRecord(expectedConfig) || !isRecord(currentConfig)
                || !isRecord(expectedConfig.data) || !isRecord(currentConfig.data)
                || typeof currentConfig.data.value !== 'string') return;
            if (!isEqual(expected.layers[id].name, current.layers[id].name)
                || !isEqual(expectedConfig.data.value, currentConfig.data.value)) return;
            const expectedStatic = isRecord(expectedConfig.data.staticData) ? expectedConfig.data.staticData : undefined;
            const currentStatic = isRecord(currentConfig.data.staticData) ? currentConfig.data.staticData : undefined;
            const staticValueExpected = Boolean(expectedStatic && Object.prototype.hasOwnProperty.call(expectedStatic, 'value'));
            const staticValueCurrent = Boolean(currentStatic && Object.prototype.hasOwnProperty.call(currentStatic, 'value'));
            if (staticValueExpected !== staticValueCurrent
                || (staticValueExpected && !isEqual(expectedStatic?.value, currentStatic?.value))) return;

            const next = {...cloneDeep(current), sceneIdentity} as {sceneIdentity: object; sceneVersion: number; canvas: RecordValue; layerHeader?: string; layerTail?: string; layers: Record<string, RecordValue>; configs: Record<string, unknown>};
            next.layers[id].name = value;
            const nextConfig = next.configs[id] as RecordValue;
            const nextData = nextConfig.data as RecordValue;
            nextData.value = cloneDeep(value);
            if (staticValueCurrent && isRecord(nextData.staticData)) nextData.staticData.value = cloneDeep(value);
            return createChange(current, next as DesignerSceneLayerSnapshot, [id]);
        },
        rename(id, name) {
            const current = read();
            if (!current || !id || typeof name !== 'string' || !current.layers[id] || current.layers[id].name === name) return;
            const next = {...cloneDeep(current), sceneIdentity} as {sceneIdentity: object; sceneVersion: number; canvas: RecordValue; layerHeader?: string; layerTail?: string; layers: Record<string, RecordValue>; configs: Record<string, unknown>};
            next.layers[id].name = name;
            return createChange(current, next as DesignerSceneLayerSnapshot, [id]);
        },
    };
    sceneLayerDisposers.set(layers, dispose);
    return layers;
}

const sceneLayerDisposers = new WeakMap<DesignerSceneLayers, () => void>();

export function disposeSceneLayers(layers: DesignerSceneLayers | undefined): void {
    if (!layers) return;
    sceneLayerDisposers.get(layers)?.();
    sceneLayerDisposers.delete(layers);
}
