/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ObjectUtil} from '@datavisool/sdk';
import {cloneDeep} from 'lodash';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import type {EditorInspectorDomain, EditorInspectorTarget} from '@datavisool/sdk/plugin/contracts/editorInspector';

vi.mock('@/plugins/editor-inspector/status-list/ComponentStatusList', () => ({default: () => null}));

import ConfigContent from '@/plugins/editor-inspector/ConfigContent';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {createEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import {createInspectorTarget} from './support/inspectorDomainFixture.ts';

const inspectorStore = createInspectorStore();
const contexts: DesignerRuntimeContext[] = [];

describe('configuration panel history with an SDK consumer', () => {
    afterEach(() => {
        cleanup();
        inspectorStore.clearTarget();
        contexts.splice(0).forEach(context => context.dispose());
    });

    it('records a panel edit through the injected controller facade and restores both values', () => {
        class Controller {
            config: Record<string, any> = {base: {id: 'sample', type: 'sample'}, style: {text: 'before'}};
            getConfig() { return this.config; }
            update(patch: object) { this.config = ObjectUtil.merge(this.config, patch); }
            destroy() {}
        }
        const controller = new Controller();
        const context = new DesignerRuntimeContext();
        contexts.push(context);
        const manager = new DesignerManager(DesignerScene.DEFAULT, context);
        manager.init({
            canvasManager: {width: 800, height: 600},
            layerManager: {
                layerHeader: 'sample', layerTail: 'sample',
                layerConfigs: {sample: {id: 'sample', type: 'sample', name: 'Test component', x: 0, y: 0, width: 100, height: 30}},
                elemConfigs: {sample: cloneDeep(controller.config)},
            },
        } as never, DesignerMode.EDIT);
        manager.layerManager.controllers.sample = controller as never;
        context.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
        const scene = createEditingScene(manager, context.managerStore.sceneVersion, () => manager.isRuntimeActive());
        const history = new HistoryOperator(() => []);
        const Editor = ({controller: target}: {controller: Controller}) => <button onClick={() => target.update({style: {text: 'after'}})}>Edit {target.getConfig()?.style.text}</button>;
        const target = {
            ...createInspectorTarget('sample', 'sample', 'Test component'),
            configPanels: {style: Editor},
        } as EditorInspectorTarget;
        const facade = {
            get config() { return cloneDeep(controller.config); },
            getConfig: () => cloneDeep(controller.getConfig()),
            update: (patch: object) => {
                const change = scene.layers.patch(scene.layers.read()!, [{id: 'sample', config: patch as Record<string, unknown>}]);
                if (!change) throw new Error('Expected the active scene to accept the panel edit');
                if (!history.recordChange(change)) {
                    change.rollback();
                    throw new Error('Expected the canvas history to accept the scene change');
                }
            },
            renameLayer: () => false,
            changeData: () => undefined,
            isCurrent: () => true,
        };
        const domain: EditorInspectorDomain = {
            sceneIdentity: scene.identity,
            sceneVersion: scene.version,
            isActive: () => true,
            readTarget: id => id === target.id ? target : undefined,
            createControllerFacade: () => facade,
            readStatuses: () => ({items: []}),
            applyStatusChange: () => true,
            applyLayerEdit: () => true,
            resetConfig: () => true,
            readDataSourceContext: id => ({staticDataSeedKey: id}),
            prepareDataSourceTest: (_id, _kind, config) => config,
            applyTheme: () => true,
            applyFilter: () => true,
        };

        act(() => inspectorStore.activateTarget(target));
        render(<ConfigContent domain={domain} store={inspectorStore} trackTask={task => task}/>);
        fireEvent.click(screen.getByRole('button', {name: 'Edit before'}));
        expect(controller.getConfig().style.text).toBe('after');

        const unexpectedLegacy = () => { throw new Error('The panel edit must use scene model history'); };
        act(() => { expect(history.undo(unexpectedLegacy)).toBe(true); });
        expect(controller.getConfig().style.text).toBe('before');
        act(() => { expect(history.redo(unexpectedLegacy)).toBe(true); });
        expect(controller.getConfig().style.text).toBe('after');
    });
});
