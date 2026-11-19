/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {cloneDeep, isEqual} from 'lodash';
import type {
    DesignerBlueprintChangeEvent,
    DesignerSceneBlueprints,
    DesignerBlueprintSnapshot,
    DesignerBlueprintPage,
    SceneModelChange,
} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {DesignerEditingCanvasOptions, DesignerEditingScene, DesignerLayerModelChangedEvent} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {DesignerBlueprintNodeMetadataContext} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import type {IBluePrintManager, IBPLine} from '@datavisool/sdk/types';
import {cloneDeep as cloneValue} from 'lodash';
import type DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {AnchorPointType} from '@datavisool/sdk/types';
import {createSceneLayers, disposeSceneLayers} from './editingSceneLayers.ts';

function rebuildAnchorIndexes(page: IBluePrintManager): void {
    const anchorMap: Record<string, string[]> = {};
    const lineMap: Record<string, string[]> = {};
    Object.values(page.bpLines ?? {}).forEach(line => {
        if (!line?.id || !line.startAnchorId || !line.endAnchorId) return;
        (anchorMap[line.startAnchorId] ??= []).push(line.endAnchorId);
        (lineMap[line.startAnchorId] ??= []).push(line.id);
        (lineMap[line.endAnchorId] ??= []).push(line.id);
    });
    page.bpAPMap = anchorMap;
    page.bpAPLineMap = lineMap;
}

type PatchResult = {readonly ok: true; readonly value: unknown} | {readonly ok: false};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Apply only fields changed by this history entry, retaining unrelated live edits. */
function applyTreePatch(current: unknown, expected: unknown, target: unknown): PatchResult {
    if (isEqual(expected, target)) return {ok: true, value: current};
    if (isRecord(expected) && isRecord(target)) {
        if (!isRecord(current)) return {ok: false};
        const result = cloneDeep(current);
        const keys = new Set([...Object.keys(expected), ...Object.keys(target)]);
        for (const key of keys) {
            if (['startPoint', 'endPoint', 'firstCP', 'secondCP'].includes(key))
                continue; // Recomputed from node positions by the editor view after model replay.
            const hasExpected = Object.prototype.hasOwnProperty.call(expected, key);
            const hasTarget = Object.prototype.hasOwnProperty.call(target, key);
            const hasCurrent = Object.prototype.hasOwnProperty.call(result, key);
            if (hasExpected === hasTarget && isEqual(expected[key], target[key])) continue;
            if (hasExpected && !hasTarget) {
                // Undoing an object addition must also remove later edits to it.
                if (!hasCurrent) return {ok: false};
                delete result[key];
                continue;
            }
            if (!hasExpected && hasTarget) {
                if (hasCurrent) return {ok: false};
                result[key] = cloneDeep(target[key]);
                continue;
            }
            if (!hasExpected || !hasTarget || !hasCurrent) return {ok: false};
            const nested = applyTreePatch(result[key], expected[key], target[key]);
            if (!nested.ok) return nested;
            result[key] = nested.value;
        }
        return {ok: true, value: result};
    }
    return isEqual(current, expected) ? {ok: true, value: cloneDeep(target)} : {ok: false};
}

function replayBlueprintPages(
    currentPages: readonly DesignerBlueprintPage[],
    expectedPages: readonly DesignerBlueprintPage[],
    targetPages: readonly DesignerBlueprintPage[],
): DesignerBlueprintPage[] | undefined {
    let current = cloneDeep([...currentPages]);
    const expectedById = new Map(expectedPages.map(page => [page.pageId, page]));
    const targetById = new Map(targetPages.map(page => [page.pageId, page]));

    for (const id of new Set([...expectedById.keys(), ...targetById.keys()])) {
        const expected = expectedById.get(id);
        const target = targetById.get(id);
        const currentIndex = current.findIndex(page => page.pageId === id);
        const currentPage = current[currentIndex];
        if (expected && !target) {
            if (!currentPage) return;
            current.splice(currentIndex, 1);
            continue;
        }
        if (!expected && target) {
            if (currentPage) return;
            // Insert after common pages have been patched and reordered.
            continue;
        }
        if (!expected || !target || !currentPage) return;
        const patched = applyTreePatch(currentPage, expected, target);
        if (!patched.ok) return;
        current[currentIndex] = patched.value as DesignerBlueprintPage;
    }

    const expectedOrder = expectedPages.filter(page => targetById.has(page.pageId)).map(page => page.pageId);
    const targetOrder = targetPages.filter(page => expectedById.has(page.pageId)).map(page => page.pageId);
    if (!isEqual(expectedOrder, targetOrder)) {
        const common = new Set(expectedOrder);
        const liveOrder = current.filter(page => common.has(page.pageId)).map(page => page.pageId);
        if (!isEqual(liveOrder, expectedOrder)) return;
        const byId = new Map(current.map(page => [page.pageId, page]));
        let index = 0;
        current = current.map(page => common.has(page.pageId) ? byId.get(targetOrder[index++])! : page);
    }

    for (let index = 0; index < targetPages.length; index++) {
        const page = targetPages[index];
        if (expectedById.has(page.pageId)) continue;
        const next = targetPages.slice(index + 1).find(item => current.some(live => live.pageId === item.pageId));
        const previous = [...targetPages.slice(0, index)].reverse().find(item => current.some(live => live.pageId === item.pageId));
        const position = next ? current.findIndex(item => item.pageId === next.pageId)
            : previous ? current.findIndex(item => item.pageId === previous.pageId) + 1
                : Math.min(index, current.length);
        current.splice(position, 0, cloneDeep(page));
    }
    return current;
}

function createSceneBlueprints(
    manager: DesignerManager,
    identity: object,
    version: number,
    isActive: () => boolean,
    canWrite: () => boolean,
    emitChanged: (event: DesignerBlueprintChangeEvent) => void,
): DesignerSceneBlueprints {
    const managerStore = manager.runtimeContext?.managerStore;
    let revision = 0;
    const active = () => isActive()
        && managerStore?.currentManager === manager
        && managerStore.sceneVersion === version;
    const readPages = () => manager.bluePrintManager.getData();
    const snapshot = (): DesignerBlueprintSnapshot | undefined => {
        if (!active()) return;
        return {sceneIdentity: identity, sceneVersion: version, revision, pages: cloneDeep(readPages())};
    };
    const notify = (pageIds: readonly string[], source: DesignerBlueprintChangeEvent['source']) => {
        const event = Object.freeze({sceneIdentity: identity, sceneVersion: version, revision, pageIds: Object.freeze([...pageIds]), source});
        try { emitChanged(event); } catch (error) { console.error('发布蓝图场景变更失败', error); }
    };
    const apply = (pages: readonly IBluePrintManager[], source: DesignerBlueprintChangeEvent['source'], pageIds: readonly string[]) => {
        if (!active()) return false;
        manager.bluePrintManager.replacePages(cloneDeep([...pages]));
        revision++;
        notify(pageIds, source);
        return true;
    };
    const changedPages = (before: readonly IBluePrintManager[], after: readonly IBluePrintManager[]) => {
        const beforeById = new Map(before.map(page => [page.pageId ?? '', page]));
        const afterById = new Map(after.map(page => [page.pageId ?? '', page]));
        return [...new Set([...beforeById.keys(), ...afterById.keys()])].filter(id =>
            !isEqual(beforeById.get(id), afterById.get(id))
            || before.findIndex(page => (page.pageId ?? '') === id) !== after.findIndex(page => (page.pageId ?? '') === id));
    };

    const blueprints: DesignerSceneBlueprints = {
        read: snapshot,
        write(input: readonly DesignerBlueprintPage[], expected) {
            if (!active() || !canWrite() || expected?.sceneIdentity !== identity
                || expected.sceneVersion !== version || revision !== expected.revision
                || !Array.isArray(input) || input.length === 0)
                return;
            const before = cloneDeep(readPages());
            const after = cloneDeep([...input]);
            const pageIds = changedPages(before, after);
            if (pageIds.length === 0) return;
            if (!apply(after, 'write', pageIds)) return;

            const change: SceneModelChange = Object.freeze({
                sceneIdentity: identity,
                sceneVersion: version,
                pageIds: Object.freeze([...pageIds]),
                rollback: () => {
                    if (!active()) return false;
                    const current = replayBlueprintPages(readPages(), after, before);
                    return Boolean(current && apply(current, 'undo', pageIds));
                },
                undo: () => {
                    if (!active()) return false;
                    const current = replayBlueprintPages(readPages(), after, before);
                    return Boolean(current && apply(current, 'undo', pageIds));
                },
                redo: () => {
                    if (!active()) return false;
                    const current = replayBlueprintPages(readPages(), before, after);
                    return Boolean(current && apply(current, 'redo', pageIds));
                },
            });
            return change;
        },
        removeNodes(ids, options) {
            return removeBlueprintNodesFromPages({identity, version, blueprints}, ids, !options?.pageId, options?.pageId);
        },
    };
    return blueprints;
}

/** Delete node data and incident lines from detached pages, then commit one scene-bound model change. */
function removeBlueprintNodesFromPages(
    scene: Pick<DesignerEditingScene, 'identity' | 'blueprints' | 'version'>,
    nodeIds: readonly string[],
    everyPage = true,
    pageId?: string,
): SceneModelChange | undefined {
    const snapshot = scene.blueprints.read();
    if (!snapshot || snapshot.sceneIdentity !== scene.identity || snapshot.sceneVersion !== scene.version || nodeIds.length === 0) return;
    const ids = new Set(nodeIds);
    const pages = cloneDeep([...snapshot.pages]);
    let changed = false;
    pages.forEach(page => {
        if (!everyPage && page.pageId !== pageId) return;
        const layouts = page.bpNodeLayoutMap ?? {};
        const configs = page.bpNodeConfigMap ?? {};
        const pageIds = new Set([...ids].filter(id => layouts[id] || configs[id]));
        if (pageIds.size === 0) return;
        Object.keys(layouts).forEach(id => { if (pageIds.has(id)) delete layouts[id]; });
        Object.keys(configs).forEach(id => { if (pageIds.has(id)) delete configs[id]; });
        Object.keys(page.bpLines ?? {}).forEach(lineId => {
            const line = page.bpLines?.[lineId] as IBPLine | undefined;
            const touchesNode = (anchorId?: string) => !!anchorId && [...pageIds].some(id => anchorId.startsWith(`${id}:`));
            if (touchesNode(line?.startAnchorId) || touchesNode(line?.endAnchorId)) delete page.bpLines?.[lineId];
        });
        rebuildAnchorIndexes(page);
        changed = true;
    });
    return changed ? scene.blueprints.write(pages, snapshot) : undefined;
}

function collectVariableOwnerManagers(owner: DesignerManager): DesignerManager[] {
    const result: DesignerManager[] = [];
    const visited = new Set<DesignerManager>();
    const visit = (manager: DesignerManager) => {
        if (visited.has(manager) || !manager.isRuntimeActive()) return;
        visited.add(manager);
        if (manager === owner || manager.variableOwner === owner) result.push(manager);
        Object.values(manager.layerManager.controllers).forEach(controller => {
            const nested = (controller as {manager?: unknown} | undefined)?.manager;
            if (nested && typeof nested === 'object' && 'bluePrintManager' in nested
                && 'layerManager' in nested && typeof (nested as DesignerManager).isRuntimeActive === 'function')
                visit(nested as DesignerManager);
        });
    };
    visit(owner);
    return result;
}

/** Remove a variable's BP nodes from its owner and all live loop managers sharing that owner. */
function removeVariableBlueprintRefs(
    sceneIdentity: object,
    owner: DesignerManager,
    activeManager: DesignerManager,
    version: number,
    isSceneActive: () => boolean,
    variableId: string,
): SceneModelChange | undefined {
    const entries: Array<{manager: DesignerManager; generation: number; before: DesignerBlueprintPage[]; after: DesignerBlueprintPage[]; pageIds: string[]}> = [];
    collectVariableOwnerManagers(owner).filter(manager => manager !== activeManager).forEach(manager => {
        const before = manager.bluePrintManager.getData();
        const after = cloneDeep(before);
        const changedPages: string[] = [];
        after.forEach(page => {
            const layouts = page.bpNodeLayoutMap ?? {};
            const configs = page.bpNodeConfigMap ?? {};
            if (!layouts[variableId] && !configs[variableId]) return;
            delete layouts[variableId];
            delete configs[variableId];
            Object.keys(page.bpLines ?? {}).forEach(lineId => {
                const line = page.bpLines[lineId] as IBPLine | undefined;
                const touches = (anchorId?: string) => Boolean(anchorId?.startsWith(`${variableId}:`));
                if (touches(line?.startAnchorId) || touches(line?.endAnchorId)) delete page.bpLines[lineId];
            });
            rebuildAnchorIndexes(page);
            changedPages.push(page.pageId);
        });
        if (changedPages.length)
            entries.push({manager, generation: manager.getRuntimeGeneration(), before, after, pageIds: changedPages});
    });
    if (!entries.length || !isSceneActive()) return;

    const entriesStillOwned = () => {
        if (!isSceneActive()) return false;
        const reachable = new Set(collectVariableOwnerManagers(owner));
        return entries.every(entry => reachable.has(entry.manager) && entry.manager.isRuntimeActive(entry.generation));
    };
    const replay = (source: 'before' | 'after', target: 'before' | 'after') => {
        if (!entriesStillOwned()) return false;
        const changes = entries.map(entry => {
            const expected = entry[source];
            const next = entry[target];
            const current = entry.manager.bluePrintManager.getData();
            const replayed = replayBlueprintPages(current, expected, next);
            return replayed ? {entry, replayed} : undefined;
        });
        if (changes.some(change => !change)) return false;
        const applied: typeof changes = [];
        try {
            changes.forEach(change => {
                if (!change) throw new Error('变量蓝图引用状态已变化。');
                change.entry.manager.bluePrintManager.replacePages(change.replayed);
                applied.push(change);
            });
            return true;
        } catch (error) {
            applied.reverse().forEach(change => {
                if (!change) return;
                try { change.entry.manager.bluePrintManager.replacePages(change.entry[source]); }
                catch (rollbackError) { console.error('回滚变量蓝图引用失败', rollbackError); }
            });
            throw error;
        }
    };

    if (!replay('before', 'after')) return;
    let currentlyRemoved = true;
    return Object.freeze({
        sceneIdentity,
        sceneVersion: version,
        pageIds: Object.freeze([...new Set(entries.flatMap(entry => entry.pageIds))]),
        rollback: () => {
            if (!currentlyRemoved || !replay('after', 'before')) return false;
            currentlyRemoved = false;
            return true;
        },
        undo: () => {
            if (!currentlyRemoved || !replay('after', 'before')) return false;
            currentlyRemoved = false;
            return true;
        },
        redo: () => {
            if (currentlyRemoved || !replay('before', 'after')) return false;
            currentlyRemoved = true;
            return true;
        },
    });
}

export function createEditingScene(
    manager: DesignerManager,
    version: number,
    isActive: () => boolean,
    emitBlueprintChanged: (event: DesignerBlueprintChangeEvent) => void = () => undefined,
    emitLayerChanged: (event: DesignerLayerModelChangedEvent) => void = () => undefined,
    canWrite: () => boolean = () => true,
): DesignerEditingScene {
    const managerStore = manager.runtimeContext?.managerStore;
    const {canvasManager, themeManager, layerManager, globalFilterManger} = manager;
    const identity = Object.freeze({});
    const sceneIsActive = () => isActive() && managerStore?.currentManager === manager && managerStore.sceneVersion === version;
    const sceneCanWrite = () => sceneIsActive() && canWrite();
    const blueprints = createSceneBlueprints(manager, identity, version, sceneIsActive, sceneCanWrite, emitBlueprintChanged);
    const layers = createSceneLayers({manager, sceneIdentity: identity, sceneVersion: version, isActive: sceneIsActive, canWrite: sceneCanWrite, blueprints, emitChanged: emitLayerChanged});
    const variableOwner = manager.variableOwner ?? manager;
    const readVariableManager = () => variableOwner.globalVariableManager;
    const blueprintNodeMetadata: DesignerBlueprintNodeMetadataContext = Object.freeze({
        isActive: sceneIsActive,
        readNodeInfo(type: 'BPLayerNode' | 'BPGlobalVariableNode', nodeId: string) {
            if (!sceneIsActive() || !nodeId) return null;
            if (type === 'BPGlobalVariableNode') {
                const variable = readVariableManager().globalVariableInstance[nodeId];
                if (!variable) return null;
                return {
                    id: nodeId,
                    name: variable.key,
                    type: 'BPGlobalVariable',
                    input: [{id: `${nodeId}:gvUpdateData:${AnchorPointType.INPUT}`, name: '更新数据', type: AnchorPointType.INPUT}],
                    output: [{id: `${nodeId}:gvDataChange:${AnchorPointType.OUTPUT}`, name: '数据变更时', type: AnchorPointType.OUTPUT}],
                };
            }
            const layer = layerManager.layerConfigs[nodeId];
            const definition = layer?.type ? manager.runtimeContext?.registry.definitions[layer.type] : undefined;
            if (!layer || !definition) return null;
            return {
                id: nodeId,
                name: layer.name,
                type: 'BPLayerNode',
                input: definition.getActionList().map(item => ({
                    id: `${nodeId}:${item.id}:${AnchorPointType.INPUT}`,
                    name: item.name,
                    type: AnchorPointType.INPUT,
                })),
                output: definition.getEventList().map(item => ({
                    id: `${nodeId}:${item.id}:${AnchorPointType.OUTPUT}`,
                    name: item.name,
                    type: AnchorPointType.OUTPUT,
                })),
            };
        },
    });
    const scene: DesignerEditingScene = {
        identity,
        version,
        get name() { return sceneIsActive() ? manager.name ?? undefined : undefined; },
        isActive: sceneIsActive,
        blueprints,
        layers,
        blueprintNodeMetadata,
        readLayerConfigs() {
            if (!sceneIsActive()) return;
            return cloneDeep(layerManager.getData().layerConfigs ?? {});
        },
        readCanvasConfig() { return sceneIsActive() ? canvasManager.getData() : undefined; },
        updateCanvasConfig(config) {
            if (!sceneCanWrite()) return false;
            canvasManager.updateCanvasConfig(config);
            return true;
        },
        readCanvasOptions(): DesignerEditingCanvasOptions | undefined {
            if (!sceneIsActive()) return;
            const config = canvasManager.getData();
            return Object.freeze({
                rasterize: config.rasterize,
                dragStep: config.dragStep,
                resizeStep: config.resizeStep,
                boxSelectionMode: config.boxSelectionMode,
                enableAdsorption: layerManager.enableAdsorption,
                enableEvent: layerManager.enableEvent,
            });
        },
        updateCanvasOptions(patch) {
            if (!sceneCanWrite() || !patch || typeof patch !== 'object') return false;
            const {enableAdsorption, enableEvent, ...canvasPatch} = patch;
            if (Object.keys(canvasPatch).length) canvasManager.updateCanvasConfig(canvasPatch);
            if (typeof enableAdsorption === 'boolean') layerManager.setEnableAdsorption(enableAdsorption);
            if (typeof enableEvent === 'boolean') layerManager.setEnableEvent(enableEvent);
            return true;
        },
        readFilterConfig() { return sceneIsActive() ? globalFilterManger.getData().config : undefined; },
        updateFilterConfig(config) {
            if (!sceneCanWrite()) return false;
            globalFilterManger.updateConfig(config);
            return true;
        },
        themes: {
            read() { return sceneIsActive() ? cloneValue(themeManager.getData() ?? []) : []; },
            replace(themes) {
                if (!sceneCanWrite()) return false;
                themeManager.updateThemeConfig(cloneValue([...themes]));
                return true;
            },
            apply(theme) {
                if (!sceneCanWrite()) return false;
                layerManager.flashGlobalTheme(cloneValue(theme));
                return true;
            },
        },
        variables: {
            list() {
                if (!sceneIsActive()) return [];
                return Object.values(readVariableManager().globalVariableInstance).map(variable => ({
                    id: variable.id, key: variable.key, bindingCount: variable.bindTarget.length, reRender: Boolean(variable.reRender),
                }));
            },
            read(id) {
                if (!sceneIsActive()) return;
                const variable = readVariableManager().globalVariableInstance[id];
                if (variable) return cloneValue(variable.getGlobalVariable());
            },
            save(variable) { return sceneCanWrite() ? readVariableManager().saveGlobalVariable(variable) : 'inactive-scene'; },
            copy(id) { return sceneCanWrite() ? readVariableManager().copyGlobalVariable(id) : 'inactive-scene'; },
            remove(id) {
                const variableManager = readVariableManager();
                if (!sceneCanWrite() || !variableManager.globalVariableInstance[id]) return false;
                const currentBlueprintChange = scene.blueprints.removeNodes([id]);
                let ownerBlueprintChange: SceneModelChange | undefined;
                try {
                    ownerBlueprintChange = removeVariableBlueprintRefs(scene.identity, variableOwner, manager, version, sceneIsActive, id);
                    if (variableManager.deleteGlobalVariable(id)) return true;
                } catch (error) {
                    ownerBlueprintChange?.rollback();
                    currentBlueprintChange?.rollback();
                    throw error;
                }
                ownerBlueprintChange?.rollback();
                currentBlueprintChange?.rollback();
                return false;
            },
        },
    };
    return scene;
}

export function disposeEditingScene(scene: DesignerEditingScene | undefined): void {
    disposeSceneLayers(scene?.layers);
}
