/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext} from 'react';
import type {EditorCommandService} from '@datavisool/sdk/plugin/contracts/editorCommands';

export const EditorCommandContext = createContext<EditorCommandService | undefined>(undefined);

export function useEditorCommands() {
    const commands = useContext(EditorCommandContext);
    if (!commands) throw new Error('Editor commands are missing.');
    return commands;
}
