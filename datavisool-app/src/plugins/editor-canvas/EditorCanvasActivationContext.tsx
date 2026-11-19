/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext, type ReactNode} from 'react';
import type {EventOperateStore} from './state/EventOperateStore.ts';
import type {CanvasContextMenuStore} from './context-menu/CanvasContextMenuStore.ts';
import type {ViewportStore} from './viewport/ViewportStore.ts';
import type HistoryOperator from './history/HistoryOperator.ts';
import type {HistoryRecordOperateProxy} from './history/HistoryRecordOperateProxy.ts';
import type {LegacyCanvasCommands} from './selection/LegacyCanvasSelection.ts';
import type {createSelectionCommands} from './selection/SelectionCommands.ts';
import type {createCanvasActions} from './commands/CanvasActions.ts';
import type {DesignerWorkspaceIdentity} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {EditorCanvasSceneStore} from './state/CanvasSceneStore.ts';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';

export interface EditorCanvasActivation {
    readonly eventOperateStore: EventOperateStore;
    readonly contextMenuStore: CanvasContextMenuStore;
    readonly viewportStore: ViewportStore;
    readonly history: HistoryOperator;
    readonly historyProxy: HistoryRecordOperateProxy;
    readonly legacyCommands: LegacyCanvasCommands;
    readonly selectionCommands: ReturnType<typeof createSelectionCommands>;
    readonly actions: ReturnType<typeof createCanvasActions>;
    readonly sceneStore: EditorCanvasSceneStore;
    isActive(): boolean;
    canEdit(): boolean;
    readWorkspace(): DesignerWorkspaceIdentity | undefined;
    readAuxiliaryBorder(): boolean;
    readScene(): DesignerEditingScene | undefined;
}

const EditorCanvasActivationContext = createContext<EditorCanvasActivation | undefined>(undefined);

export function EditorCanvasActivationProvider({value, children}: {readonly value: EditorCanvasActivation; readonly children: ReactNode}) {
    return <EditorCanvasActivationContext.Provider value={value}>{children}</EditorCanvasActivationContext.Provider>;
}

export function useEditorCanvasActivation(): EditorCanvasActivation {
    const activation = useContext(EditorCanvasActivationContext);
    if (!activation) throw new Error('Canvas UI requires an active editor-canvas plugin activation.');
    return activation;
}
