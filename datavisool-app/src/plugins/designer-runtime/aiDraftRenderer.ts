/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createElement, Fragment} from 'react';
import {reaction} from 'mobx';
import {cloneDeep} from 'lodash';
import type {
    DesignerAiDraftAcceptance,
    DesignerAiDraftRenderer,
    DesignerAiDraftSnapshot,
    DesignerAiDraftChange,
    DesignerWorkspaceIdentity,
} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import CanvasRender from '@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts';
import {AiLayerDraftRuntime} from './AiDraftRendererRuntime.ts';

export function createDesignerAiDraftRenderer(
    manager: DesignerManager,
    catalog: DesignerCatalog,
    scope: DesignerWorkspaceIdentity,
    sceneIdentity: object,
    sceneVersion: number,
    isActive: () => boolean,
    onDraftChanged: (change: DesignerAiDraftChange) => void,
): DesignerAiDraftRenderer {
    const runtime = new AiLayerDraftRuntime(manager, catalog, isActive);
    let disposed = false;
    const ensureActive = () => {
        if (disposed || !isActive()) throw Object.assign(new Error('AI draft scene is no longer active'), {name: 'AbortError'});
    };
    const read = (): DesignerAiDraftSnapshot | undefined => {
        if (!isActive()) return;
        const draft = runtime.activeDraft;
        if (!draft) return;
        return Object.freeze({
            draftId: draft.draftId,
            revision: draft.revision,
            layerCount: draft.layerCount,
            interactive: draft.interactive,
            ...(draft.layout ? {layout: Object.freeze(draft.layout.map(region => Object.freeze({...region})))} : {}),
            batches: Object.freeze(draft.batches.map(batch => Object.freeze({
                batchId: batch.batchId,
                sequence: batch.sequence,
                regionId: batch.regionId,
                layerCount: batch.layerCount,
                bounds: Object.freeze({...batch.bounds}),
            }))),
        });
    };
    const readAcceptance = (batchId?: string): DesignerAiDraftAcceptance | undefined => {
        ensureActive();
        const result = batchId ? runtime.acceptBatch(batchId) : runtime.acceptDraft(runtime.activeDraft?.draftId ?? '');
        if (!result) return;
        return Object.freeze({
            layers: cloneDeep(result.layers),
            configs: cloneDeep(result.configs),
            componentLayerIds: Object.freeze({...result.componentLayerIds}),
            componentBindings: Object.freeze({...result.componentBindings}),
        });
    };
    const stopDraftReaction = reaction(
        () => runtime.activeDraft,
        () => {
            if (!isActive()) return;
            const snapshot = read();
            onDraftChanged({
                sceneIdentity,
                sceneVersion,
                scope,
                ...(snapshot ? {draftId: snapshot.draftId, revision: snapshot.revision} : {}),
            });
        },
    );
    return {
        isActive: () => !disposed && isActive(),
        render(input) {
            ensureActive();
            const components = cloneDeep(input.components) as any[];
            if (input.layout || input.regionId || input.draftId) {
                if (!input.regionId || !input.ownerKey)
                    throw new Error('Partitioned AI drafts require regionId and ownerKey.');
                runtime.renderPartitioned(components, {
                    regionId: input.regionId,
                    layout: input.layout ? cloneDeep(input.layout) as any[] : undefined,
                    draftId: input.draftId,
                    incremental: Boolean(input.incremental),
                    ownerKey: input.ownerKey,
                });
            } else {
                runtime.render(components, Boolean(input.incremental), input.interactive !== false, input.ownerKey);
            }
            return read()!;
        },
        read,
        preparePreview(draftId, expectedRevision, ownerKey) {
            ensureActive();
            runtime.prepareDraftPreview(draftId, expectedRevision, ownerKey);
            const snapshot = read();
            if (!snapshot) throw Object.assign(new Error('Draft preview is no longer available.'), {name: 'AbortError'});
            return snapshot;
        },
        bindPreviewConfirmation(draftId, complete) {
            ensureActive();
            return runtime.bindPreviewConfirmation(draftId, complete);
        },
        renderBatch(batchId) {
            ensureActive();
            const batch = runtime.activeDraft?.batches.find(item => item.batchId === batchId);
            if (!batch) return null;
            return createElement(Fragment, {key: `${sceneVersion}-${batch.batchId}-${runtime.activeDraft?.revision}`},
                CanvasRender.buildCanvasComponents(batch.manager, '-ai-draft'));
        },
        readAcceptance,
        discardUiBatch(batchId) {
            ensureActive();
            return runtime.discardBatch(batchId);
        },
        clear(ownerKey) {
            if (disposed) return false;
            if (ownerKey) return runtime.clearOwnedDraft(ownerKey);
            const hadDraft = runtime.activeDraft !== null;
            runtime.clear();
            return hadDraft;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            stopDraftReaction();
            runtime.clear();
        },
    };
}
