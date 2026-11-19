/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {
    editorLayerUiEventKey,
    editorSelectionChangedKey,
} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {editorInspectorChangedKey} from '@datavisool/sdk/plugin/contracts/editorInspector';
import {designerWorkspaceChangedKey} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/editorCommands';
import {Layers} from '@icon-park/react';
import {EditorLayersState} from './EditorLayersState.ts';
import {createLayerConsumer} from './LayerConsumer.ts';

export function createEditorLayersPlugin(): Plugin {
    return {
        id: 'editor-layers',
        requires: ['editorCanvas', 'designerCatalog', 'editorShell', 'editorCommands'],
        provides: [],
        activate(context) {
            const {editorCanvas, editorShell, editorCommands, designerCatalog} = context;
            let active = true;
            const state = new EditorLayersState();
            const consumer = createLayerConsumer(editorCanvas, state);
            const {prepareLayerDomain} = consumer;
            context.onStop({
                pause: state.pause,
                cancel: state.resume,
            });

            context.onDispose(() => {
                active = false;
                consumer.dispose();
                state.dispose();
            });
            context.onDispose(editorCommands.register('layers.search', () => {
                if (active && state.isAccepting()) state.toggleSearch();
            }));
            context.onDispose(context.on(designerWorkspaceChangedKey, () => state.resetScene()));
            context.onDispose(context.on(editorSelectionChangedKey, () => state.refresh()));
            context.onDispose(context.on(editorLayerUiEventKey, event => state.acceptUiEvent(event)));
            context.onDispose(context.on(editorInspectorChangedKey, event => {
                if (event.sceneVersion === state.readSceneVersion()
                    && (event.kind === 'layers-updated' || event.kind === 'targets-deleted')) state.refresh();
            }));
            context.onDispose(editorShell.registerDockPanel({
                id: 'layer-list', label: '图层', icon: <Layers theme="outline" size={20}/>, order: 30,
                Panel: lazy(async () => {
                    const {default: LayerList} = await import('./LayerList.tsx');
                    return {default: props => <LayerList {...props} canvas={consumer.canvas} state={state} prepareLayerDomain={prepareLayerDomain}/>};
                }),
            }));
            context.onDispose(editorShell.registerView('layerSearch', lazy(async () => {
                const [{default: SearchLayer}, catalog] = await Promise.all([
                    import('./search-layer/SearchLayer.tsx'), designerCatalog.prepare(),
                ]);
                return {default: () => <SearchLayer canvas={consumer.canvas} state={state} catalog={catalog} prepareLayerDomain={prepareLayerDomain}/>};
            })));
        },
    };
}
