/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext} from 'react';
import type {EditorInspectorDomain, EditorInspectorTarget} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {InspectorStore} from './InspectorStore.ts';

export interface InspectorDomainContextValue {
    readonly domain: EditorInspectorDomain;
    readonly target: EditorInspectorTarget;
    readonly store: InspectorStore;
    readonly canEdit: () => boolean;
    readonly trackTask: <T>(task: Promise<T>) => Promise<T>;
}

export const InspectorDomainContext = createContext<InspectorDomainContextValue | null>(null);
