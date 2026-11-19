/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext} from 'react';
import type {EditorBlueprintSession} from './EditorBlueprintSession.ts';

const EditorBlueprintSessionContext = createContext<EditorBlueprintSession | undefined>(undefined);

export const EditorBlueprintSessionProvider = EditorBlueprintSessionContext.Provider;

export function useEditorBlueprintSession(): EditorBlueprintSession {
    const session = useContext(EditorBlueprintSessionContext);
    if (!session) throw new Error('Blueprint editor session is unavailable outside the editor-blueprint overlay.');
    return session;
}
