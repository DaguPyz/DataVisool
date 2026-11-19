/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext} from 'react';
import type {DesignerDockState} from './DesignerDockState.ts';

export const DesignerDockContext = createContext<DesignerDockState | undefined>(undefined);

export function useDesignerDock() {
    const state = useContext(DesignerDockContext);
    if (!state) throw new Error('The editor dock is unavailable.');
    return state;
}
