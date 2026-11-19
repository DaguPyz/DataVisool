/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext, useEffect, type DependencyList} from 'react';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {ShortcutStore} from './core/ShortcutStore.ts';
import type {createShortcutEffects} from './shortcutEffects.ts';

export interface ShortcutContextValue {
    readCanvasInput: EditorCanvasService['readInputContext'];
    store: ShortcutStore;
    effects: ReturnType<typeof createShortcutEffects>;
}

export const ShortcutContext = createContext<ShortcutContextValue | undefined>(undefined);

export function useShortcuts() {
    const value = useContext(ShortcutContext);
    if (!value) throw new Error('Shortcut UI must be mounted by editor-shortcuts.');
    return value;
}

export function useShortcutEffect(setup: () => void | (() => void), dependencies: DependencyList) {
    const {effects} = useShortcuts();
    useEffect(() => effects.register(setup), [effects, ...dependencies]);
}
