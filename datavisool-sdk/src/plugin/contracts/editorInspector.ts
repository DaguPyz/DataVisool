/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType} from 'react';
import type {ComponentDataUpdater, HostDataUpdaterOptions} from '../../core.js';
import type {MenuInfo} from '../../core/ComponentTypes.js';
import type {BaseInfoType, DataConfigType, IFilterConfigType, ILayerItem, ILayerTransformItem, IThemeItem, UpdateOptions} from '../../types.js';
import {createEventKey} from '../../plugin.js';

export interface EditorInspectorTarget {
    readonly id: string;
    readonly type: string;
    /** Detached snapshot of the selected layer's editable geometry and identity. */
    readonly layer: Readonly<ILayerItem>;
    readonly componentInfo: Readonly<BaseInfoType & Record<string, unknown>>;
    readonly menus: readonly MenuInfo[];
    readonly configPanels: Readonly<Record<string, ComponentType<any>>>;
    /** Fresh factory result, detached from the runtime definition. */
    readonly initialConfig: Readonly<Record<string, unknown>>;
}

export interface EditorInspectorStatusItem {
    readonly id: string;
    readonly name: string;
}

export interface EditorInspectorStatusSnapshot {
    readonly items: readonly EditorInspectorStatusItem[];
}

export type EditorInspectorStatusChange =
    | {readonly kind: 'activate'; readonly id: string}
    | {readonly kind: 'add'}
    | {readonly kind: 'delete'; readonly id: string}
    | {readonly kind: 'rename'; readonly id: string; readonly name: string};

export type EditorInspectorLayerEdit =
    | {readonly kind: 'rename'; readonly name: string}
    | {readonly kind: 'move'; readonly x?: number; readonly y?: number}
    | {readonly kind: 'resize'; readonly width?: number; readonly height?: number}
    | {readonly kind: 'align'; readonly alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'}
    | {readonly kind: 'transform'; readonly transform: Partial<ILayerTransformItem>};

export type EditorInspectorDataSourceTestKind = 'api' | 'commonApi' | 'database' | 'webSocket' | 'mqtt';

export interface EditorInspectorDataSourceContext {
    readonly sourceTypes?: readonly DataConfigType['sourceType'][];
    readonly staticDataDraftValue?: unknown;
    readonly staticDataSeedKey: string;
}

/** Changes emitted by the canvas-owned inspector adapter after model operations. */
export type EditorInspectorChangeDetail =
    | {readonly kind: 'targets-deleted'; readonly ids: readonly string[]}
    | {readonly kind: 'layers-updated'; readonly layers: readonly (Pick<ILayerItem, 'id'> & Partial<ILayerItem>)[]}
    | {readonly kind: 'configs-restored'; readonly ids: readonly string[]};

export type EditorInspectorChange = EditorInspectorChangeDetail & {readonly sceneIdentity: object; readonly sceneVersion: number};

/** Editing-only facade over a selected component. It deliberately omits controller lifecycle APIs. */
export interface EditorInspectorController {
    readonly config: unknown;
    getConfig(): any;
    update(config: any, options?: UpdateOptions): void;
    changeData(data: any): void;
    createHostDataUpdater?(
        success: (data?: any) => void,
        fail: () => void,
        options?: HostDataUpdaterOptions,
    ): ComponentDataUpdater | null;
    renameLayer(name: string): boolean;
    isCurrent(): boolean;
}

/**
 * Canvas-owned inspector data and mutation capability. It is prepared for one active edit scene;
 * all snapshots are detached and all mutations become no-ops after that scene is replaced.
 */
export interface EditorInspectorDomain {
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    /** Whether the bound scene and runtime activation are still current; a temporary stop pause does not invalidate reads. */
    isActive(): boolean;
    readTarget(id: string): EditorInspectorTarget | undefined;
    createControllerFacade(id: string, statusId?: string | null): EditorInspectorController | undefined;
    readStatuses(id: string): EditorInspectorStatusSnapshot | undefined;
    applyStatusChange(id: string, change: EditorInspectorStatusChange): boolean;
    applyLayerEdit(id: string, edit: EditorInspectorLayerEdit): boolean;
    resetConfig(id: string, statusId?: string | null): boolean;
    readDataSourceContext(id: string): EditorInspectorDataSourceContext | undefined;
    prepareDataSourceTest(id: string, kind: EditorInspectorDataSourceTestKind, config: unknown): unknown | undefined;
    applyTheme(id: string, theme: IThemeItem): boolean;
    applyFilter(id: string, filter: IFilterConfigType): boolean;
}

export const editorInspectorChangedKey = createEventKey<EditorInspectorChange>('app/editor/inspector-changed');
