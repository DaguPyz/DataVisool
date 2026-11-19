/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext} from 'react';
import type {DesignerEditingWorkspace} from '@datavisool/sdk/plugin/contracts/designerRuntime';

export const EditorWorkspaceContext = createContext<DesignerEditingWorkspace | undefined>(undefined);

export function useEditorWorkspace() {
    return useContext(EditorWorkspaceContext);
}

export function useEditorScene() {
    return useEditorWorkspace()?.readScene();
}
