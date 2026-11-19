/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {IBluePrintManager} from '../../types.js';
import {createEventKey} from '../../plugin.js';

/** Runtime-normalized serialized page: legacy optional fields are always materialized. */
export interface DesignerBlueprintPage extends IBluePrintManager {
    readonly pageId: string;
    readonly pageName: string;
    readonly bpNodeLayoutMap: NonNullable<IBluePrintManager['bpNodeLayoutMap']>;
    readonly bpNodeConfigMap: NonNullable<IBluePrintManager['bpNodeConfigMap']>;
    readonly bpLines: NonNullable<IBluePrintManager['bpLines']>;
    readonly bpAPMap: NonNullable<IBluePrintManager['bpAPMap']>;
    readonly bpAPLineMap: NonNullable<IBluePrintManager['bpAPLineMap']>;
}

/** A detached, revisioned snapshot of the blueprint graph owned by one edit scene. */
export interface DesignerBlueprintSnapshot {
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    readonly revision: number;
    readonly pages: readonly DesignerBlueprintPage[];
}

/** Model-only history entry. Implementations must not capture editor UI resources. */
export interface SceneModelChange {
    /** Opaque identity shared with the editing scene that created this history entry. */
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    readonly pageIds: readonly string[];
    /** Reverts a just-applied change when the owner rejects history registration. */
    rollback(): boolean;
    undo(): boolean;
    redo(): boolean;
}

export interface DesignerBlueprintChangeEvent {
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    readonly revision: number;
    readonly pageIds: readonly string[];
    readonly source: 'write' | 'undo' | 'redo';
}

export const designerBlueprintChangedKey = createEventKey<DesignerBlueprintChangeEvent>('app/designer/blueprint-changed');

export type DesignerBlueprintWriteResult = SceneModelChange | undefined;

/** Scene-bound blueprint graph reads and writes. Every returned page is detached from runtime state. */
export interface DesignerSceneBlueprints {
    read(): DesignerBlueprintSnapshot | undefined;
    /** Replaces only pages whose serialized data differs from the current snapshot. */
    write(pages: readonly DesignerBlueprintPage[], expected: DesignerBlueprintSnapshot): DesignerBlueprintWriteResult;
    removeNodes(ids: readonly string[], options?: {readonly pageId?: string}): DesignerBlueprintWriteResult;
}
