/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {CSSProperties, ReactNode} from 'react';
import type {AdaptationType, DesignerMode, ICanvasManager, IDesignerManager, IFilterConfigType, IGlobalVariable, ILayerItem, IThemeItem} from '../../types.js';
import type {HostConfigPanels} from '../../host.js';
import {createEventKey} from '../../plugin.js';
import type {DesignerSceneBlueprints, SceneModelChange} from './designerBlueprint.js';
import type {DesignerBlueprintNodeRegistry, DesignerBlueprintNodeMetadataContext} from './editorBlueprint.js';
import type {EditorInspectorChange, EditorInspectorDomain} from './editorInspector.js';
export type {EditorBlueprintNodeController, EditorBlueprintNodeConfigFacade, DesignerBlueprintNodeDefinition, DesignerBlueprintNodeRegistry, DesignerBlueprintNodeMetadataContext} from './editorBlueprint.js';

export type DesignerRuntimeMode = DesignerMode.EDIT | DesignerMode.PREVIEW | DesignerMode.RELEASE;

export interface DesignerProjectCanvas {
    readonly width?: number;
    readonly height?: number;
    readonly adaptationType?: AdaptationType;
    readonly filterStyle: CSSProperties;
    readonly content: ReactNode;
}

export interface DesignerProjectSnapshot {
    readonly id: string;
    readonly name?: string;
    readonly data: IDesignerManager;
}

export interface DesignerProjectSession {
    readonly loaded: boolean;
    readonly name?: string;
    readonly editing?: DesignerEditingWorkspace;
    load(id: string, password?: string): Promise<void>;
    getProjectId(): string | undefined;
    getSnapshot(scope?: 'active' | 'root'): DesignerProjectSnapshot | undefined;
    readRemoteComponentPaths(): Readonly<Record<string, string>>;
    renderCanvas(actions?: DesignerProjectRenderActions): DesignerProjectCanvas;
    close(): void;
}

/** Canvas-owned actions injected into the runtime compatibility renderer. */
export interface DesignerProjectRenderActions {
    /** Canvas-owned UI state, passed as render data so the runtime does not own canvas controls. */
    readonly auxiliaryBorder?: boolean;
    renameLayer(id: string, name: string, sceneVersion: number): boolean;
    updateBaseTextContent(id: string, value: unknown, sceneVersion: number): boolean;
}

export interface DesignerWorkspaceIdentity {
    readonly rootId: string;
    readonly activeId: string;
    readonly nested: boolean;
    /** Stable component ids of loop containers between the active project and the current nested workspace. */
    readonly loopPath?: readonly string[];
}

export interface DesignerEditingWorkspace {
    read(): DesignerWorkspaceIdentity | undefined;
    readScene(): DesignerEditingScene | undefined;
    enterLoopContainer(layerId: string): boolean;
    leaveLoopContainer(): boolean;
    open(id: string, options?: {refresh?: boolean}): Promise<boolean>;
    restore(id: string, data: IDesignerManager): Promise<boolean>;
    rename(id: string, name: string): void;
    cancelLoad(): void;
}

export interface DesignerSceneThemes {
    read(): IThemeItem[];
    replace(themes: readonly IThemeItem[]): boolean;
    apply(theme: IThemeItem): boolean;
}

export interface DesignerVariableSummary {
    readonly id: string;
    readonly key: string;
    readonly bindingCount: number;
    readonly reRender: boolean;
}

export type DesignerVariableWriteResult = 'saved' | 'missing-name' | 'duplicate-name' | 'missing-variable' | 'inactive-scene';

export interface DesignerSceneVariables {
    list(): readonly DesignerVariableSummary[];
    read(id: string): IGlobalVariable | undefined;
    save(variable: IGlobalVariable): DesignerVariableWriteResult;
    copy(id: string): DesignerVariableWriteResult;
    remove(id: string): boolean;
}

export interface DesignerEditingScene {
    /** Opaque, process-local identity unique to this live edit-scene instance. */
    readonly identity: object;
    readonly version: number;
    readonly name?: string;
    isActive(): boolean;
    readCanvasConfig(): ICanvasManager | undefined;
    updateCanvasConfig(config: ICanvasManager): boolean;
    readCanvasOptions(): DesignerEditingCanvasOptions | undefined;
    updateCanvasOptions(patch: Partial<DesignerEditingCanvasOptions>): boolean;
    readFilterConfig(): IFilterConfigType | undefined;
    updateFilterConfig(config: Partial<IFilterConfigType>): boolean;
    readonly themes: DesignerSceneThemes;
    readonly variables: DesignerSceneVariables;
    readonly layers: DesignerSceneLayers;
    readonly blueprints: DesignerSceneBlueprints;
    /** Detached layer snapshot for editor-owned node configuration views. */
    readLayerConfigs(): Readonly<Record<string, ILayerItem>> | undefined;
    /** Scene-bound, DTO-only metadata bridge for node default configuration. */
    readonly blueprintNodeMetadata: DesignerBlueprintNodeMetadataContext;
}

/** Runtime-owned canvas settings needed by canvas controls, detached from manager state. */
export interface DesignerEditingCanvasOptions {
    readonly rasterize?: boolean;
    readonly dragStep?: number;
    readonly resizeStep?: number;
    readonly boxSelectionMode?: ICanvasManager['boxSelectionMode'];
    readonly enableAdsorption: boolean;
    readonly enableEvent: boolean;
}

/** Host callbacks injected by the editor canvas when requesting its runtime-owned inspector adapter. */
export interface DesignerInspectorDomainHost {
    /** Whether this bound edit scene currently accepts writes; reads may remain available during stop pause. */
    canWrite(): boolean;
    recordChange(change: SceneModelChange): boolean;
    emit(change: EditorInspectorChange): void;
    select(ids: readonly string[]): void;
}

/** Detached edit-scene model used by canvas adapters; configs and layer records never alias runtime state. */
export interface DesignerSceneLayerSnapshot {
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    readonly canvas: Readonly<ICanvasManager>;
    readonly layerHeader?: string;
    readonly layerTail?: string;
    readonly layers: Readonly<Record<string, Readonly<ILayerItem>>>;
    readonly configs: Readonly<Record<string, unknown>>;
}

export interface DesignerSceneLayerPatch {
    readonly id: string;
    readonly layer?: Readonly<Partial<ILayerItem>>;
    /** A shallow config patch, merged into the existing component config. */
    readonly config?: Readonly<Record<string, unknown>>;
}

/** Scene-bound layer model operations. Writes return model-only history changes for canvas to record. */
export interface DesignerSceneLayers {
    read(): DesignerSceneLayerSnapshot | undefined;
    patch(expected: DesignerSceneLayerSnapshot, patches: readonly DesignerSceneLayerPatch[]): SceneModelChange | undefined;
    remove(expected: DesignerSceneLayerSnapshot, ids: readonly string[]): SceneModelChange | undefined;
    replace(
        expected: DesignerSceneLayerSnapshot,
        next: Omit<DesignerSceneLayerSnapshot, 'sceneIdentity' | 'sceneVersion'>,
        options?: {readonly reRender?: boolean},
    ): SceneModelChange | undefined;
    updateBaseTextContent(expected: DesignerSceneLayerSnapshot, id: string, value: unknown): SceneModelChange | undefined;
    applyTheme(id: string, theme: IThemeItem): SceneModelChange | undefined;
    rename(id: string, name: string): SceneModelChange | undefined;
}

export interface DesignerLayerModelChangedEvent {
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    readonly kind: 'rename' | 'changed';
    readonly ids: readonly string[];
}

export const designerWorkspaceChangedKey = createEventKey<DesignerWorkspaceIdentity>('app/designer/workspace-changed');
export const designerLayerModelChangedKey = createEventKey<DesignerLayerModelChangedEvent>('app/designer/layer-model-changed');

export type DesignerSessionFactory = () => DesignerProjectSession;

export interface DesignerRuntimeService {
    readEditingScene(): DesignerEditingScene | undefined;
    prepareInspectorDomain(host: DesignerInspectorDomainHost, signal?: AbortSignal): Promise<EditorInspectorDomain>;
    prepare(mode: DesignerRuntimeMode): Promise<DesignerSessionFactory>;
    prepareBlueprintNodes(): Promise<DesignerBlueprintNodeRegistry>;
    registerHostConfigPanels(panels: Partial<HostConfigPanels>): () => void;
    prepareAiDraftRenderer(
        scope: DesignerWorkspaceIdentity,
        sceneVersion: number,
        signal: AbortSignal,
        onDraftChanged: (change: DesignerAiDraftChange) => void,
    ): Promise<DesignerAiDraftRenderer>;
}

/** Runtime-owned, edit-mode renderer for detached AI draft data. It never exposes a manager or definition instance. */
export interface DesignerAiDraftRenderer {
    isActive(): boolean;
    render(input: DesignerAiDraftRenderInput): DesignerAiDraftSnapshot;
    read(): DesignerAiDraftSnapshot | undefined;
    renderBatch(batchId: string): ReactNode | null;
    preparePreview(draftId: string, expectedRevision: number, ownerKey: string): DesignerAiDraftSnapshot;
    readAcceptance(batchId?: string): DesignerAiDraftAcceptance | undefined;
    bindPreviewConfirmation(draftId: string, complete: (confirmed: boolean) => void): () => void;
    discardUiBatch(batchId: string): boolean;
    clear(ownerKey?: string): boolean;
    dispose(): void;
}

export interface DesignerAiDraftRenderInput {
    readonly components: readonly DesignerAiDraftComponent[];
    readonly interactive?: boolean;
    readonly incremental?: boolean;
    readonly ownerKey?: string;
    readonly draftId?: string;
    readonly regionId?: string;
    readonly layout?: readonly DesignerAiDraftRegion[];
}

export interface DesignerAiDraftComponent {
    readonly id?: string;
    readonly type: string;
    readonly name?: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly order?: number;
    readonly config?: Readonly<Record<string, unknown>>;
    readonly useDefaultConfig?: boolean;
}

export interface DesignerAiDraftRegion {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface DesignerAiDraftSnapshot {
    readonly draftId: string;
    readonly revision: number;
    readonly layerCount: number;
    readonly interactive: boolean;
    readonly layout?: readonly DesignerAiDraftRegion[];
    readonly batches: readonly DesignerAiDraftBatchSnapshot[];
}

/** Runtime notifies its canvas owner, which republishes this through kernel events. */
export interface DesignerAiDraftChange {
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    readonly scope: DesignerWorkspaceIdentity;
    readonly draftId?: string;
    readonly revision?: number;
}

export interface DesignerAiDraftBatchSnapshot {
    readonly batchId: string;
    readonly sequence: number;
    readonly regionId?: string;
    readonly layerCount: number;
    readonly bounds: {readonly x: number; readonly y: number; readonly width: number; readonly height: number};
}

export interface DesignerAiDraftAcceptance {
    readonly layers: Readonly<Record<string, import('../../types.js').ILayerItem>>;
    readonly configs: Readonly<Record<string, unknown>>;
    readonly componentLayerIds: Readonly<Record<string, string>>;
    readonly componentBindings: Readonly<Record<string, string>>;
}

declare module '../../plugin.js' {
    interface PluginServices {
        designerRuntime: DesignerRuntimeService;
    }
}
