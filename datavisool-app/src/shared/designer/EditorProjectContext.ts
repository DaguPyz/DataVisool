/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext} from 'react';
import type {EditorProjectActions} from '@datavisool/sdk/plugin/contracts/editorProject';

export const EditorProjectContext = createContext<EditorProjectActions | undefined>(undefined);

export function useEditorProject(): EditorProjectActions {
    const actions = useContext(EditorProjectContext);
    if (!actions) throw new Error('Editor project actions are missing.');
    return actions;
}
