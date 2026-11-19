/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cloneDeep} from 'lodash';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {DesignerBlueprintNodeRegistry} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import type {IBluePrintManager} from '@datavisool/sdk/types';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import BluePrintManager from '@/plugins/designer-runtime/internal/designer/blueprint/manager/BluePrintManager.ts';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import {createEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import {EditorBlueprintSession} from '@/plugins/editor-blueprint/session/EditorBlueprintSession.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';

export function createBlueprintSessionFixture(pages?: IBluePrintManager[], registry: DesignerBlueprintNodeRegistry = {get: () => undefined, list: () => []}) {
    const runtimeContext = new DesignerRuntimeContext();
    const managerStore = runtimeContext.managerStore;
    const model = new BluePrintManager();
    model.init(pages ?? [{pageId: 'page-1', pageName: 'Page 1'}], DesignerMode.EDIT);
    const manager = new class {
        id = 'blueprint-fixture';
        runtimeContext = runtimeContext;
        scene = DesignerScene.DEFAULT;
        bluePrintManager = model;
        layerManager = {layerConfigs: {}, controllers: {}, getData() { return {layerConfigs: this.layerConfigs}; }};
        globalVariableManager = {globalVariableInstance: {}};
    };
    managerStore.setCurrentManager(manager as never);
    let session: EditorBlueprintSession;
    const scene = createEditingScene(manager as never, managerStore.sceneVersion, () => true, event => session?.refreshFromScene(event));
    const history = new HistoryOperator(() => []);
    const project = {editing: {readScene: () => scene}, getSnapshot: () => ({data: cloneDeep({layerManager: manager.layerManager, globalVariableManager: {globalVariables: {}}})})};
    const canvas = {recordChange: (change: SceneModelChange) => history.recordChange(change)};
    session = new EditorBlueprintSession({scene, project: project as never, registry, canvas: canvas as never});
    return {
        session, scene, model, history, project, canvas, registry,
        dispose() {
            try { session.dispose(); } finally {
                model.destroy();
                if (managerStore.currentManager === manager) managerStore.clear();
                runtimeContext.dispose();
            }
        },
    };
}
