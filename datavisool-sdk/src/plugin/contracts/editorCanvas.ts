/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createEventKey} from '../../plugin.js';
import type {ReactNode} from 'react';
import type {ILayerItem} from '../../types.js';
import type {EditorShortcutInputQuery} from './editorShortcuts.js';
import type {EditorInspectorDomain} from './editorInspector.js';
import type {DesignerWorkspaceIdentity, DesignerAiDraftChange} from './designerRuntime.js';
import type {SceneModelChange} from './designerBlueprint.js';
import type {DesignerAiDraftComponent, DesignerAiDraftRegion, DesignerAiDraftSnapshot, DesignerAiDraftAcceptance} from './designerRuntime.js';

export type CanvasRepairIssueType =
    | 'missing-header'
    | 'missing-tail'
    | 'missing-layer'
    | 'cycle'
    | 'duplicate-layer'
    | 'tail-mismatch';

export interface CanvasRepairIssue {
    readonly type: CanvasRepairIssueType;
    readonly message: string;
    readonly layerId?: string;
    readonly relatedId?: string;
}

export interface CanvasRepairAnalysis {
    readonly layerCount: number;
    readonly layerHeader?: string;
    readonly layerTail?: string;
    readonly reachableCount: number;
    readonly reachableIds: readonly string[];
    readonly renderTailId?: string;
    readonly orphanCount: number;
    readonly orphanIds: readonly string[];
    readonly orphanLayers: readonly ILayerItem[];
    readonly issues: readonly CanvasRepairIssue[];
}

export interface EditorCanvasRepairService {
    readRepairAnalysis(sceneVersion: number): CanvasRepairAnalysis | undefined;
    readRepairLayer(sceneVersion: number, layerId: string): ILayerItem | undefined;
    locateRepairLayer(sceneVersion: number, layerId: string): boolean;
    deleteRepairOrphans(sceneVersion: number, layerIds: readonly string[]): boolean;
    prependRepairOrphans(sceneVersion: number, layerIds: readonly string[]): boolean;
    repairTailPointer(sceneVersion: number): boolean;
}

export type EditorSelectionSource = 'canvas' | 'layer-list' | 'search' | 'context-menu' | 'system';

export interface EditorSelection {
    readonly ids: readonly string[];
    readonly source: EditorSelectionSource;
}

export interface EditorSelectionTemplateSnapshot {
    readonly sceneVersion: number;
    readonly layers: Record<string, ILayerItem>;
    readonly configs: Record<string, unknown>;
}

/** Detached layer data exposed by the active editor scene. */
export type EditorLayerNode = Readonly<Omit<ILayerItem, 'children'>> & {
    readonly effectiveHidden: boolean;
    readonly effectiveLocked: boolean;
    readonly children?: readonly EditorLayerNode[];
};

export interface EditorLayerCanvasSize {
    readonly width: number;
    readonly height: number;
}

/** Result of inserting a complete legacy layer template into the active canvas. */
export interface EditorTemplateInsertResult {
    readonly appliedLayerIds: readonly string[];
    readonly layerIdMap: Readonly<Record<string, string>>;
}

/** Scene-bound layer model operations owned by the canvas and its history stack. */
export interface EditorLayerDomain {
    readonly sceneVersion: number;
    isActive(): boolean;
    readTree(): readonly EditorLayerNode[];
    readLayer(id: string): EditorLayerNode | undefined;
    readCanvasSize(): EditorLayerCanvasSize | undefined;
    rename(id: string, name: string): boolean;
    setHidden(id: string, hidden: boolean): boolean;
    setLocked(id: string, locked: boolean): boolean;
    reorder(sourceId: string, targetId: string, position: 'before' | 'after'): boolean;
}

export type EditorLayerUiEvent =
    | {readonly kind: 'refresh'; readonly sceneVersion: number}
    | {readonly kind: 'unfold'; readonly sceneVersion: number; readonly groupIds: readonly string[]; readonly unfold: boolean}
    | {readonly kind: 'reveal'; readonly sceneVersion: number; readonly targetId: string; readonly unfoldIds: readonly string[]};

/** Detached AI-facing view of the active editing scene. No controller or manager instance crosses this boundary. */
export interface EditorAiCanvasSnapshot {
    readonly sceneVersion: number;
    readonly scope: DesignerWorkspaceIdentity;
    readonly managerId?: string;
    readonly width: number;
    readonly height: number;
    readonly components: readonly EditorAiComponentSnapshot[];
}

export interface EditorAiComponentSnapshot {
    readonly id: string;
    readonly type?: string;
    readonly name?: string;
    readonly layer: Readonly<Record<string, unknown>>;
    readonly config?: Readonly<Record<string, unknown>>;
}

export interface EditorAiComponentPatch {
    readonly componentId: string;
    readonly componentType: string;
    readonly stylePatch?: {readonly style: Readonly<Record<string, unknown>>};
    readonly dataPatch?: Readonly<Record<string, unknown>>;
    readonly layerPatch?: Readonly<Record<string, unknown>>;
    readonly filterPatch?: Readonly<Record<string, unknown>>;
}

export interface EditorAiExpectedComponentSnapshot {
    readonly componentId: string;
    readonly componentType: string;
    readonly style?: unknown;
    readonly data?: unknown;
    readonly layer?: unknown;
    readonly filter?: unknown;
}

export interface EditorAiCanvasMutationFailure {
    readonly componentId: string;
    readonly code: string;
    readonly message: string;
    readonly [detail: string]: unknown;
}

export interface EditorAiCanvasMutationResult {
    readonly applied: readonly {readonly componentId: string; readonly componentType: string}[];
    readonly failed: readonly EditorAiCanvasMutationFailure[];
    readonly [detail: string]: unknown;
}

/** Snapshot-based history entry for an atomic AI edit. Implementations must reject stale scenes. */

/** Edit-only capability bound to one stable workspace and one in-process scene version. */
export interface EditorAiEditingSession {
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    readonly scope: DesignerWorkspaceIdentity;
    isActive(): boolean;
    readCanvas(): EditorAiCanvasSnapshot;
    readComponents(componentIds: readonly string[], fields?: readonly ('layer' | 'config' | 'base' | 'style' | 'data' | 'filter')[]): {
        readonly components: readonly EditorAiComponentSnapshot[];
        readonly missingComponentIds: readonly string[];
    };
    readSelection(): EditorSelection;
    applyComponentPatch(patches: readonly EditorAiComponentPatch[], expected?: readonly EditorAiExpectedComponentSnapshot[]): Promise<EditorAiCanvasMutationResult>;
    applyComponentStylePatch(patches: readonly EditorAiComponentPatch[], expected?: readonly EditorAiExpectedComponentSnapshot[]): EditorAiCanvasMutationResult;
    deleteComponents(targets: readonly {readonly componentId: string; readonly componentType: string; readonly layer: unknown}[]): EditorAiCanvasMutationResult;
    renderDraft(input: {
        readonly components: readonly DesignerAiDraftComponent[];
        readonly incremental?: boolean;
        readonly interactive?: boolean;
        readonly ownerKey?: string;
        readonly draftId?: string;
        readonly regionId?: string;
        readonly layout?: readonly DesignerAiDraftRegion[];
    }): DesignerAiDraftSnapshot;
    readDraft(): DesignerAiDraftSnapshot | undefined;
    renderDraftBatch(batchId: string): ReactNode | null;
    prepareDraftPreview(draftId: string, expectedRevision: number, ownerKey: string): DesignerAiDraftSnapshot;
    bindDraftPreviewConfirmation(draftId: string, complete: (confirmed: boolean) => void): () => void;
    readDraftAcceptance(batchId?: string): DesignerAiDraftAcceptance | undefined;
    acceptDraft(draftId: string, expectedRevision?: number): {
        readonly appliedLayerIds: readonly string[];
        readonly componentBindings: Readonly<Record<string, string>>;
    } | undefined;
    acceptDraftBatch(batchId: string): readonly string[];
    discardDraftBatch(batchId: string): boolean;
    clearDraft(ownerKey?: string): boolean;
    dispose(): void;
}

/** Legacy ambient viewport type retained for source compatibility. */
export interface EditorViewportCompatibility {
    destroy(): void;
    refresh(): void;
    zoomBy(factor: number, anchor?: {x: number; y: number}): void;
    setScale(scale: number, anchor?: {x: number; y: number}): void;
    fitArtboard(): void;
    reset(): void;
    centerOn(point: {x: number; y: number}): void;
    getVisibleWorldBounds(): {x: number; y: number; width: number; height: number};
}

export type EditorSelectionInteraction =
    | {readonly kind: 'layer-row' | 'inspect'; readonly id: string}
    | {readonly kind: 'clear-inspector'};

export interface EditorSelectionChange extends EditorSelection {
    readonly interaction?: EditorSelectionInteraction;
}

export type EditorCanvasAction =
    | 'selectAll'
    | 'doClone'
    | 'doCopy'
    | 'doLock'
    | 'doUnLock'
    | 'layerToTop'
    | 'layerToBottom'
    | 'layerMoveUp'
    | 'layerMoveDown'
    | 'doDelete'
    | 'doHide'
    | 'doGrouping'
    | 'doUnGrouping'
    | 'removeFromGroup'
    | 'cleanEmptyGroupings'
    | 'doMoveUp'
    | 'doMoveDown'
    | 'doMoveLeft'
    | 'doMoveRight'
    | 'doBaseBottomEnlargeUp'
    | 'doBaseUpEnlargeDown'
    | 'doBaseRightEnlargeLeft'
    | 'doBaseLeftEnlargeRight'
    | 'doBaseBottomDecreaseUp'
    | 'doBaseUpDecreaseDown'
    | 'doBaseRightDecreaseLeft'
    | 'doBaseLeftDecreaseRight'
    | 'groupLeftAligned'
    | 'groupRightAligned'
    | 'groupTopAligned'
    | 'groupBottomAligned'
    | 'toggleSecondaryBorder'
    | 'createLoopContainer'
    | 'selectTool'
    | 'handTool';

export interface EditorCanvasService {
    registerShortcutInput(query: EditorShortcutInputQuery): () => void;
    prepareInspectorDomain(signal?: AbortSignal): Promise<EditorInspectorDomain>;
    prepareLayerDomain(signal?: AbortSignal): Promise<EditorLayerDomain>;
    isSceneActive(sceneVersion: number): boolean;
    readAiWorkspace(): EditorAiCanvasSnapshot | undefined;
    prepareAiEditing(scope: DesignerWorkspaceIdentity, signal: AbortSignal): Promise<EditorAiEditingSession>;
    performAction(action: EditorCanvasAction): Promise<void>;
    paste(data: string): Promise<void>;
    readSelection(): EditorSelection;
    readInputContext(): {readonly pointerTarget: EventTarget | null; readonly contextMenuOpen: boolean};
    closeContextMenu(): void;
    readSelectionTemplate(): EditorSelectionTemplateSnapshot | undefined;
    select(ids: readonly string[], source?: EditorSelectionSource, interaction?: EditorSelectionInteraction): void;
    getLayerType(id: string): string | undefined;
    focus(): void;
    resolveDrop(event: Pick<MouseEvent, 'clientX' | 'clientY' | 'target'>): {
        readonly position: {readonly x: number; readonly y: number};
        readonly within: boolean;
    } | null;
    insertLayer(layer: ILayerItem, config?: Record<string, unknown>): void;
    insertTemplate(template: {layers: Record<string, ILayerItem>; configs: Record<string, unknown>}): void;
    /** Validates all required source IDs before changing the model and records one undoable insertion. */
    insertTemplateAtomically(template: {layers: Record<string, ILayerItem>; configs: Record<string, unknown>}, requiredSourceIds: readonly string[]): EditorTemplateInsertResult | undefined;
    /** Renames a layer in the bound scene and records the returned model change in the shared canvas history. */
    renameLayer(id: string, name: string, sceneVersion: number): boolean;
    /** Atomically updates a BaseText value and layer name, then records one shared history change. */
    updateBaseTextContent(id: string, value: unknown, sceneVersion: number): boolean;
    undo(): void;
    redo(): void;
    /** Adds a runtime-owned scene model change to the existing mixed editor history queue. */
    recordChange(change: SceneModelChange): boolean;
    prepareRepair(): Promise<EditorCanvasRepairService>;
}

export const editorSelectionChangedKey = createEventKey<EditorSelectionChange>('app/editor/selection-changed');
export const editorLayerDoubleClickedKey = createEventKey<string | null>('app/editor/layer-double-clicked');
export const editorLayerUiEventKey = createEventKey<EditorLayerUiEvent>('app/editor/layers/ui');
export const editorAiDraftChangedKey = createEventKey<DesignerAiDraftChange>('app/editor/ai-draft-changed');

declare module '../../plugin.js' {
    interface PluginServices {
        editorCanvas: EditorCanvasService;
    }
}
