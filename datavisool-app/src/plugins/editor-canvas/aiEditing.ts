/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {cloneDeep, isEqual, merge} from 'lodash';
import type {
    EditorAiComponentPatch,
    EditorAiEditingSession,
    EditorAiExpectedComponentSnapshot,
    EditorSelection,
} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {
    DesignerAiDraftAcceptance,
    DesignerAiDraftRenderer,
    DesignerEditingScene,
    DesignerWorkspaceIdentity,
    DesignerSceneLayerSnapshot,
} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {ILayerItem} from '@datavisool/sdk/types';
import {normalizeDataConfigAsync} from '@/util/DataSourceConfigUtil.ts';

type LayerSnapshot = NonNullable<ReturnType<DesignerEditingScene['layers']['read']>>;

interface MutableLayerSnapshot {
    sceneIdentity: object;
    sceneVersion: number;
    canvas: Record<string, unknown>;
    layerHeader?: string;
    layerTail?: string;
    layers: Record<string, Record<string, any>>;
    configs: Record<string, Record<string, any>>;
}

interface TemplateInsertResult {
    readonly appliedLayerIds: readonly string[];
    readonly layerIdMap: Readonly<Record<string, string>>;
}

interface TemplateInput {
    readonly layers: Record<string, ILayerItem>;
    readonly configs: Record<string, unknown>;
}

export class EditorAiCanvasOperationError extends Error {
    constructor(public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) {
        super(message);
        this.name = 'EditorAiCanvasOperationError';
    }
}

export function createAiEditingSession(options: {
    scene: DesignerEditingScene;
    scope: DesignerWorkspaceIdentity;
    isActive(): boolean;
    isSceneActive(): boolean;
    readSelection(): EditorSelection;
    recordChange(change: SceneModelChange): boolean;
    draftRenderer: DesignerAiDraftRenderer;
    insertTemplateAtomically(template: TemplateInput, requiredSourceIds: readonly string[]): TemplateInsertResult | undefined;
}): EditorAiEditingSession {
    const {scene, scope, draftRenderer} = options;
    const sceneIdentity = scene.identity;
    const sceneVersion = scene.version;
    let disposed = false;
    const isActive = () => !disposed && draftRenderer.isActive() && options.isActive()
        && options.isSceneActive() && scene.identity === sceneIdentity
        && scene.version === sceneVersion && scene.isActive();
    const staleSceneError = () => new EditorAiCanvasOperationError(
        'agent_workspace_changed',
        'AI 编辑目标工作空间已失效',
        {fieldPath: 'agentScope.workspaceScope', expectedValue: scope},
    );
    const requireActive = () => {
        if (!isActive()) throw staleSceneError();
    };
    const readSnapshot = (): LayerSnapshot => {
        requireActive();
        const snapshot = scene.layers.read();
        if (!snapshot || snapshot.sceneIdentity !== sceneIdentity || snapshot.sceneVersion !== sceneVersion)
            throw staleSceneError();
        return snapshot;
    };
    const readConfig = (snapshot: LayerSnapshot, id: string): Record<string, any> | undefined => {
        const config = snapshot.configs[id];
        return isRecord(config) ? cloneDeep(config) : undefined;
    };
    const recordChange = (change: SceneModelChange | undefined): boolean => {
        if (!change) return false;
        if (change.sceneIdentity !== sceneIdentity || change.sceneVersion !== sceneVersion || !isActive()) {
            rollbackOrThrow(change, staleSceneError(), 'AI 场景已失效，且无法回滚刚生成的模型修改。');
            throw staleSceneError();
        }
        try {
            if (options.recordChange(change)) return true;
        } catch (error) {
            rollbackOrThrow(change, error, 'AI 编辑历史登记抛错，且原场景已无法安全回滚。');
            throw error;
        }
        const error = new EditorAiCanvasOperationError('history_record_failed', 'AI 编辑未能写入画布历史', {
            fieldPath: 'history.recordChange', expectedValue: 'true',
        });
        rollbackOrThrow(change, error, 'AI 编辑历史登记失败，且原场景已无法安全回滚。');
        throw error;
    };
    const replaceSnapshot = (before: LayerSnapshot, next: MutableLayerSnapshot): 'changed' | 'unchanged' | 'rejected' => {
        const input = snapshotReplaceInput(next);
        if (isEqual(snapshotReplaceInput(before), input)) return 'unchanged';
        const change = scene.layers.replace(before, input);
        if (!change) return 'rejected';
        recordChange(change);
        return 'changed';
    };
    const readCanvas: EditorAiEditingSession['readCanvas'] = () => {
        const snapshot = readSnapshot();
        const components = Object.values(snapshot.layers)
            .filter((layer): layer is Readonly<ILayerItem> & {id: string} => Boolean(layer?.id))
            .map(layer => Object.freeze({
                id: layer.id,
                type: layer.type,
                name: layer.name,
                layer: Object.freeze(cloneDeep(layer) as Record<string, unknown>),
                config: readConfig(snapshot, layer.id),
            }));
        return Object.freeze({
            sceneVersion,
            scope: Object.freeze({...scope, loopPath: Object.freeze([...(scope.loopPath ?? [])])}),
            managerId: scope.nested ? (scope.loopPath?.at(-1) ?? scope.activeId) : scope.activeId || undefined,
            width: finite(snapshot.canvas.width),
            height: finite(snapshot.canvas.height),
            components: Object.freeze(components),
        });
    };
    const readComponents: EditorAiEditingSession['readComponents'] = (componentIds, fields) => {
        const snapshot = readSnapshot();
        const requested = new Set(fields ?? ['layer', 'config']);
        const found: Array<{id: string; type?: string; name?: string; layer: Record<string, unknown>; config?: Record<string, unknown>}> = [];
        const missingComponentIds: string[] = [];
        componentIds.forEach(id => {
            const layer = snapshot.layers[id];
            if (!layer) { missingComponentIds.push(id); return; }
            const config = readConfig(snapshot, id);
            found.push({
                id,
                type: layer.type,
                name: layer.name,
                layer: cloneDeep(layer) as Record<string, unknown>,
                ...(requested.has('config') || [...requested].some(field => ['base', 'style', 'data', 'filter'].includes(field))
                    ? {config} : {}),
            });
        });
        return {components: Object.freeze(found.map(item => Object.freeze(item))), missingComponentIds: Object.freeze(missingComponentIds)};
    };

    const preparePatches = (
        snapshot: LayerSnapshot,
        patches: readonly EditorAiComponentPatch[],
        expected: readonly EditorAiExpectedComponentSnapshot[],
    ) => {
        const expectedById = new Map(expected.map(item => [item.componentId, item]));
        const prepared: Array<{
            patch: EditorAiComponentPatch;
            config: Record<string, any>;
            layer: Readonly<ILayerItem>;
            expected?: EditorAiExpectedComponentSnapshot;
            nextStyle?: unknown;
            nextData?: Record<string, any>;
            nextFilter?: Record<string, unknown>;
        }> = [];
        const failed: Array<{componentId: string; code: string; message: string; [key: string]: unknown}> = [];
        patches.forEach(patch => {
            const layer = snapshot.layers[patch.componentId];
            const config = readConfig(snapshot, patch.componentId) ?? {};
            const actualType = config.base?.type ?? layer?.type;
            if (!layer) {
                failed.push({componentId: patch.componentId, code: 'controller_not_found', message: `未找到组件：${patch.componentId}`});
                return;
            }
            if (actualType !== patch.componentType) {
                failed.push({componentId: patch.componentId, code: 'component_type_mismatch', message: `组件类型已变化：${actualType ?? 'unknown'}`, actualValue: actualType, expectedValue: patch.componentType});
                return;
            }
            const expectedSnapshot = expectedById.get(patch.componentId);
            const changedPaths = expectedSnapshot ? snapshotConflicts(patch, expectedSnapshot, config, layer) : [];
            if (changedPaths.length) {
                failed.push({componentId: patch.componentId, code: 'component_revision_conflict', message: '组件读取后状态已变化', fieldPath: changedPaths[0].fieldPath, changedPaths});
                return;
            }
            prepared.push({
                patch,
                config,
                layer,
                expected: expectedSnapshot,
                ...(patch.stylePatch ? {nextStyle: merge({}, cloneDeep(config.style ?? {}), cloneDeep(patch.stylePatch.style))} : {}),
                ...(patch.filterPatch ? {nextFilter: merge({}, cloneDeep(config.filter ?? {}), cloneDeep(patch.filterPatch))} : {}),
            });
        });
        return {prepared, failed};
    };

    const applyComponentPatch: EditorAiEditingSession['applyComponentPatch'] = async (patches, expected = []) => {
        const initial = readSnapshot();
        const {prepared, failed} = preparePatches(initial, patches, expected);
        if (failed.length) return {applied: [], failed};
        for (const item of prepared) {
            if (item.patch.dataPatch) {
                item.nextData = await normalizeDataConfigAsync(
                    isRecord(item.config.data) ? item.config.data : {},
                    cloneDeep(item.patch.dataPatch),
                );
            }
        }
        requireActive();
        const current = readSnapshot();
        const latestFailures: Array<{componentId: string; code: string; message: string; [key: string]: unknown}> = [];
        prepared.forEach(item => {
            const layer = current.layers[item.patch.componentId];
            const config = readConfig(current, item.patch.componentId) ?? {};
            if (!layer) {
                latestFailures.push({componentId: item.patch.componentId, code: 'controller_not_found', message: `未找到组件：${item.patch.componentId}`});
                return;
            }
            if (item.expected) {
                const changedPaths = snapshotConflicts(item.patch, item.expected, config, layer);
                if (changedPaths.length)
                    latestFailures.push({componentId: item.patch.componentId, code: 'component_revision_conflict', message: '组件读取后状态已变化', fieldPath: changedPaths[0].fieldPath, changedPaths});
            }
        });
        if (latestFailures.length) return {applied: [], failed: latestFailures};

        const next = cloneDeep(current) as unknown as MutableLayerSnapshot;
        for (const item of prepared) {
            const layer = next.layers[item.patch.componentId];
            const config = next.configs[item.patch.componentId] ?? {};
            if (item.patch.layerPatch)
                next.layers[item.patch.componentId] = merge({}, layer, cloneDeep(item.patch.layerPatch), {id: item.patch.componentId});
            const nextConfig = cloneDeep(config);
            if (item.nextStyle !== undefined) nextConfig.style = cloneDeep(item.nextStyle);
            if (item.nextData !== undefined) nextConfig.data = cloneDeep(item.nextData);
            if (item.nextFilter !== undefined) nextConfig.filter = cloneDeep(item.nextFilter);
            next.configs[item.patch.componentId] = nextConfig;
        }
        const result = replaceSnapshot(current, next);
        if (result === 'rejected') return {applied: [], failed: conflictFailures(patches)};
        return {applied: patches.map(item => ({componentId: item.componentId, componentType: item.componentType})), failed: []};
    };

    const applyComponentStylePatch: EditorAiEditingSession['applyComponentStylePatch'] = (patches, expected = []) => {
        const current = readSnapshot();
        const {prepared, failed} = preparePatches(current, patches, expected);
        if (failed.length) return {applied: [], failed};
        const next = cloneDeep(current) as unknown as MutableLayerSnapshot;
        prepared.forEach(item => {
            const config = cloneDeep(next.configs[item.patch.componentId] ?? {});
            config.style = merge({}, cloneDeep(config.style ?? {}), cloneDeep(item.patch.stylePatch?.style ?? {}));
            next.configs[item.patch.componentId] = config;
        });
        const result = replaceSnapshot(current, next);
        if (result === 'rejected') return {applied: [], failed: conflictFailures(patches)};
        return {applied: patches.map(item => ({componentId: item.componentId, componentType: item.componentType})), failed: []};
    };

    const deleteComponents: EditorAiEditingSession['deleteComponents'] = targets => {
        const snapshot = readSnapshot();
        const failed = targets.flatMap(target => {
            const layer = snapshot.layers[target.componentId];
            if (!layer) return [{componentId: target.componentId, code: 'component_not_found', message: '目标组件已不存在'}];
            if (layer.type !== target.componentType) return [{componentId: target.componentId, code: 'component_type_mismatch', message: '目标组件类型已变化'}];
            if (!isEqual(layer, target.layer)) return [{componentId: target.componentId, code: 'component_revision_conflict', message: '目标组件读取后状态已变化'}];
            return [];
        });
        if (failed.length) return {applied: [], failed};
        const ids = [...new Set(targets.map(target => target.componentId))];
        const change = scene.layers.remove(snapshot, ids);
        if (!change) return {applied: [], failed: conflictFailures(targets.map(target => ({componentId: target.componentId, componentType: target.componentType})))};
        recordChange(change);
        return {
            applied: targets.map(target => ({componentId: target.componentId, componentType: target.componentType})),
            failed: [],
        };
    };

    const accept = (draftId: string, expectedRevision?: number) => {
        requireActive();
        const draft = draftRenderer.read();
        if (!draft || draft.draftId !== draftId || (expectedRevision != null && draft.revision !== expectedRevision)) return;
        const acceptance = draftRenderer.readAcceptance();
        if (!acceptance) return;
        const result = insertAcceptance(acceptance, draft.layerCount);
        if (!result) return;
        draftRenderer.clear();
        return {
            appliedLayerIds: Object.freeze([...result.appliedLayerIds]),
            componentBindings: Object.freeze(componentBindingsFor(acceptance, result)),
        };
    };

    return {
        sceneIdentity,
        sceneVersion,
        scope,
        isActive,
        readCanvas,
        readComponents,
        readSelection() { requireActive(); return options.readSelection(); },
        applyComponentPatch,
        applyComponentStylePatch,
        deleteComponents,
        renderDraft(input) { requireActive(); return draftRenderer.render(input); },
        readDraft() { return draftRenderer.read(); },
        renderDraftBatch(batchId) { return draftRenderer.renderBatch(batchId); },
        prepareDraftPreview(draftId, expectedRevision, ownerKey) { requireActive(); return draftRenderer.preparePreview(draftId, expectedRevision, ownerKey); },
        bindDraftPreviewConfirmation(draftId, complete) { requireActive(); return draftRenderer.bindPreviewConfirmation(draftId, complete); },
        readDraftAcceptance(batchId) { return draftRenderer.readAcceptance(batchId); },
        acceptDraft: accept,
        acceptDraftBatch(batchId) {
            requireActive();
            const acceptance = draftRenderer.readAcceptance(batchId);
            if (!acceptance) return [];
            const result = insertAcceptance(acceptance, Object.keys(acceptance.layers).length);
            if (!result) return [];
            draftRenderer.discardUiBatch(batchId);
            return Object.freeze([...result.appliedLayerIds]);
        },
        discardDraftBatch(batchId) { requireActive(); return draftRenderer.discardUiBatch(batchId); },
        clearDraft(ownerKey) { return draftRenderer.clear(ownerKey); },
        dispose() { if (disposed) return; disposed = true; draftRenderer.dispose(); },
    };

    function insertAcceptance(acceptance: DesignerAiDraftAcceptance, expectedLayerCount: number): TemplateInsertResult | undefined {
        const requiredSourceIds = Object.values(acceptance.componentLayerIds);
        const inserted = options.insertTemplateAtomically({
            layers: cloneDeep(acceptance.layers) as Record<string, ILayerItem>,
            configs: cloneDeep(acceptance.configs) as Record<string, unknown>,
        }, requiredSourceIds);
        if (!inserted || inserted.appliedLayerIds.length !== expectedLayerCount) return;
        const appliedIds = new Set(inserted.appliedLayerIds);
        if (appliedIds.size !== expectedLayerCount) return;
        if (requiredSourceIds.some(id => !inserted.layerIdMap[id] || !appliedIds.has(inserted.layerIdMap[id]))) return;
        return inserted;
    }

    function componentBindingsFor(acceptance: DesignerAiDraftAcceptance, inserted: TemplateInsertResult): Record<string, string> {
        return Object.fromEntries(Object.entries(acceptance.componentLayerIds).map(([componentId, sourceId]) => [componentId, inserted.layerIdMap[sourceId]]));
    }

    function rollbackOrThrow(change: SceneModelChange, cause: unknown, message: string): void {
        try {
            if (change.rollback()) return;
            throw new Error('场景模型拒绝回滚。');
        } catch (rollbackError) {
            throw new AggregateError([cause, rollbackError], message);
        }
    }
}

function snapshotReplaceInput(snapshot: LayerSnapshot | MutableLayerSnapshot): Omit<DesignerSceneLayerSnapshot, 'sceneIdentity' | 'sceneVersion'> {
    const {sceneIdentity: _sceneIdentity, sceneVersion: _sceneVersion, ...input} = snapshot;
    return input as unknown as Omit<DesignerSceneLayerSnapshot, 'sceneIdentity' | 'sceneVersion'>;
}

function conflictFailures(items: readonly {componentId: string; componentType: string}[]) {
    return items.map(item => ({componentId: item.componentId, code: 'component_revision_conflict', message: '组件读取后状态已变化'}));
}

function snapshotConflicts(
    patch: EditorAiComponentPatch,
    expected: EditorAiExpectedComponentSnapshot,
    config: Record<string, any>,
    layer: object,
) {
    const changed: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> = [];
    if (patch.stylePatch && !isEqual(config.style ?? null, expected.style)) changed.push({fieldPath: 'style', expectedValue: expected.style, currentValue: cloneDeep(config.style ?? null)});
    if (patch.dataPatch && !isEqual(config.data ?? null, expected.data)) changed.push({fieldPath: 'data', expectedValue: expected.data, currentValue: cloneDeep(config.data ?? null)});
    if (patch.layerPatch && !isEqual(layer, expected.layer)) changed.push({fieldPath: 'layer', expectedValue: expected.layer, currentValue: cloneDeep(layer)});
    if (patch.filterPatch && !isEqual(config.filter ?? null, expected.filter)) changed.push({fieldPath: 'filter', expectedValue: expected.filter, currentValue: cloneDeep(config.filter ?? null)});
    return changed;
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}
