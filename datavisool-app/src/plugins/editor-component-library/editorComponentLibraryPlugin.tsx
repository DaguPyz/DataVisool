/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {EditorDockPanelProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import {AddOne, Components} from '@icon-park/react';
import {ComponentListStore} from './ComponentListStore.ts';

export function createEditorComponentLibraryPlugin(): Plugin {
    return {
        id: 'editor-component-library',
        requires: ['designerCatalog', 'editorCanvas', 'editorShell'],
        provides: [],
        activate(context) {
            const {designerCatalog, editorCanvas, editorShell} = context;
            const componentListStore = new ComponentListStore();
            context.onStop({
                pause() { componentListStore.pause(); },
                cancel() { componentListStore.resume(); },
            });
            context.onDispose(() => componentListStore.dispose());
            context.onDispose(editorShell.registerToolbarItem({
                id: 'component-library-open', group: 'add', order: 20,
                View: () => <button type="button" className="workspace-icon-button" aria-label="打开组件库" title="组件库"
                                    onClick={() => editorShell.openDockPanel('components', {toggle: true})}>
                    <AddOne theme="outline" size={19}/>
                </button>,
            }));
            context.onDispose(editorShell.registerDockPanel({
                id: 'components', label: '组件库', icon: <Components theme="outline" size={20}/>, order: 10,
                Panel: lazy(async () => {
                    const [{ComponentList}, catalog] = await Promise.all([
                        import('./ComponentList.tsx'),
                        designerCatalog.prepare(),
                    ]);
                    return {default: ({onClose}: EditorDockPanelProps) => <ComponentList canvas={editorCanvas} catalog={catalog} store={componentListStore} onClose={onClose}/>};
                }),
            }));
        },
    };
}
