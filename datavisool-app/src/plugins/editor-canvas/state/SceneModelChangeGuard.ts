/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';

/** A version is only unique inside one scene object; require both runtime identity tokens. */
export function isSceneModelChangeForScene(
    scene: DesignerEditingScene | undefined,
    change: SceneModelChange | undefined,
): boolean {
    return Boolean(scene && change && scene.identity && change.sceneIdentity
        && scene.identity === change.sceneIdentity
        && scene.version === change.sceneVersion
        && scene.isActive());
}

export function rollbackUnrecordedSceneModelChange(change: SceneModelChange, cause?: unknown): void {
    let rolledBack = false;
    try { rolledBack = change.rollback(); }
    catch (rollbackError) {
        if (cause !== undefined) throw new AggregateError([cause, rollbackError], '场景变更登记失败且回滚异常。');
        throw rollbackError;
    }
    if (!rolledBack) {
        const rollbackError = new Error('新建场景变更未登记且无法回滚。');
        if (cause !== undefined) throw new AggregateError([cause, rollbackError], '场景变更登记失败且回滚失败。');
        throw rollbackError;
    }
    if (cause !== undefined) throw cause;
}

/** Roll back a newly applied change whenever the history owner rejects or throws. */
export function recordSceneModelChange(
    change: SceneModelChange,
    register: (change: SceneModelChange) => boolean,
): boolean {
    try {
        if (register(change)) return true;
    } catch (error) {
        rollbackUnrecordedSceneModelChange(change, error);
    }
    rollbackUnrecordedSceneModelChange(change);
    return false;
}
