/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from 'vitest';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import {isSceneModelChangeForScene} from '@/plugins/editor-canvas/state/SceneModelChangeGuard.ts';

const makeScene = (identity: object) => ({
    identity,
    version: 3,
    isActive: () => true,
}) as unknown as DesignerEditingScene;

const makeChange = (sceneIdentity: object) => ({
    sceneIdentity,
    sceneVersion: 3,
    pageIds: [],
    rollback: () => true,
    undo: () => true,
    redo: () => true,
}) as SceneModelChange;

describe('scene model change identity guard', () => {
    it('rejects a change from another scene even when its scene version matches', () => {
        const firstIdentity = {};
        const secondIdentity = {};
        const firstScene = makeScene(firstIdentity);
        const staleChange = makeChange(firstIdentity);

        expect(isSceneModelChangeForScene(firstScene, staleChange)).toBe(true);
        expect(isSceneModelChangeForScene(makeScene(secondIdentity), staleChange)).toBe(false);
        expect(isSceneModelChangeForScene(firstScene, {...staleChange, sceneIdentity: undefined} as never)).toBe(false);
    });
});
