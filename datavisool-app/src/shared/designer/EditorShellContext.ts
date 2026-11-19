/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext} from 'react';
import type {EditorShellService} from '@datavisool/sdk/plugin/contracts/editorShell';

export const EditorShellContext = createContext<EditorShellService | undefined>(undefined);

export function useEditorShell() {
    const shell = useContext(EditorShellContext);
    if (!shell) throw new Error('Editor shell is missing.');
    return shell;
}
