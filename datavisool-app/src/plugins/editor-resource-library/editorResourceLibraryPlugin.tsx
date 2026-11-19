/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {EditorDockPanelProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import {Box} from '@icon-park/react';
import {createResourceLibraryLifecycle} from './ResourceLibraryLifecycle.ts';

export function createEditorResourceLibraryPlugin(): Plugin {
    return {
        id: 'editor-resource-library',
        requires: ['designerCatalog', 'editorCanvas', 'editorShell'],
        provides: [],
        activate(context) {
            const {designerCatalog, editorCanvas, editorShell} = context;
            const lifecycle = createResourceLibraryLifecycle();
            context.onStop({
                pause() { lifecycle.pause(); },
                prepare() { return lifecycle.prepare(); },
                cancel() { lifecycle.cancel(); },
            });
            context.onDispose(() => lifecycle.dispose());
            context.onDispose(editorShell.registerDockPanel({
                id: 'source-list', label: '资源库', icon: <Box theme="outline" size={20}/>, order: 20,
                Panel: lazy(async () => {
                    const [{default: SourceList}, catalog] = await Promise.all([
                        import('./SourceList.tsx'),
                        designerCatalog.prepare(),
                    ]);
                    return {default: ({onClose}: EditorDockPanelProps) => <SourceList canvas={editorCanvas} catalog={catalog} lifecycle={lifecycle} onClose={onClose}/>};
                }),
            }));
        },
    };
}
