/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from 'vitest';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {createCanvasRepairService} from '@/plugins/editor-canvas/canvas-repair.ts';

const makeScene = (id: string, identity: object = {}) => ({
    identity,
    version: 7,
    name: id,
    isActive: () => true,
    layers: {
        read: () => ({
            sceneIdentity: identity,
            sceneVersion: 7,
            canvas: {width: 800, height: 600},
            layerHeader: id,
            layerTail: id,
            layers: {[id]: {id, type: 'BaseText', name: id}},
            configs: {},
        }),
    },
}) as unknown as DesignerEditingScene;

describe('canvas repair service scene lifecycle', () => {
    it('rejects a same-version scene switch and blocks edits while paused', () => {
        const originalScene = makeScene('old-layer');
        const nextScene = makeScene('new-layer');
        let activeScene: DesignerEditingScene | undefined = originalScene;
        let canEdit = true;
        const history = {
            doRepairOrphansPrepend: vi.fn(),
            doRepairTailPointer: vi.fn(),
        };
        const select = vi.fn();
        const deleteLayersByIds = vi.fn(() => true);
        const service = createCanvasRepairService({
            history: history as never,
            scene: originalScene,
            readScene: () => activeScene,
            canEdit: () => canEdit,
            select,
            deleteLayersByIds,
        });

        expect(service.readRepairLayer(7, 'old-layer')).toMatchObject({id: 'old-layer'});
        activeScene = nextScene;
        expect(service.readRepairLayer(7, 'old-layer')).toBeUndefined();
        expect(service.locateRepairLayer(7, 'new-layer')).toBe(false);
        expect(select).not.toHaveBeenCalled();

        activeScene = originalScene;
        canEdit = false;
        expect(service.readRepairLayer(7, 'old-layer')).toMatchObject({id: 'old-layer'});
        expect(service.locateRepairLayer(7, 'old-layer')).toBe(false);
        expect(service.deleteRepairOrphans(7, ['old-layer'])).toBe(false);
        expect(service.prependRepairOrphans(7, ['old-layer'])).toBe(false);
        expect(service.repairTailPointer(7)).toBe(false);
        expect(deleteLayersByIds).not.toHaveBeenCalled();
        expect(history.doRepairOrphansPrepend).not.toHaveBeenCalled();
        expect(history.doRepairTailPointer).not.toHaveBeenCalled();
    });

    it('rejects snapshots without an explicit scene identity token', () => {
        const scene = makeScene('layer-a');
        const snapshotWithoutIdentity = {
            ...scene,
            layers: {read: () => ({sceneVersion: 7, layers: {['layer-a']: {id: 'layer-a'}}})},
        } as unknown as DesignerEditingScene;
        const service = createCanvasRepairService({
            history: {doRepairOrphansPrepend: vi.fn(), doRepairTailPointer: vi.fn()} as never,
            scene: snapshotWithoutIdentity,
            readScene: () => snapshotWithoutIdentity,
            canEdit: () => true,
            select: vi.fn(),
            deleteLayersByIds: vi.fn(() => true),
        });

        expect(service.readRepairLayer(7, 'layer-a')).toBeUndefined();
    });
});
