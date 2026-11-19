/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cloneDeep} from 'lodash';
import {runInAction} from 'mobx';
import {DesignerMode, DesignerScene, type ILayerItem} from '@datavisool/sdk/types';
import type {DesignerAiDraftAcceptance, DesignerAiDraftRenderer, DesignerAiDraftSnapshot} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import DataUtil from '@/util/DataUtil.ts';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {BaseTextController} from '@/comps/builtin/base-text/BaseTextController.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';
import {createEditingScene, disposeEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import {createAiEditingSession} from '@/plugins/editor-canvas/aiEditing.ts';

type AtomicInsert = (
    template: {readonly layers: Record<string, ILayerItem>; readonly configs: Record<string, unknown>},
    requiredSourceIds: readonly string[],
) => {readonly appliedLayerIds: readonly string[]; readonly layerIdMap: Readonly<Record<string, string>>} | undefined;

const cleanups: Array<() => void> = [];
afterEach(() => {
    cleanups.splice(0).reverse().forEach(cleanup => cleanup());
    vi.restoreAllMocks();
});

function fixture(options: {record?: boolean; insertTemplateAtomically?: AtomicInsert} = {}) {
    const context = new DesignerRuntimeContext();
    const manager = new DesignerManager(DesignerScene.DEFAULT, context);
    manager.id = 'project';
    const initialConfig = {
        base: {id: 'text', type: 'BaseText', name: 'Text'}, style: {color: '#123456'},
        data: {sourceType: 'static', staticData: {value: [{value: 1}]}, value: [{value: 1}]},
    };
    manager.init({canvasManager: {width: 800, height: 600}, layerManager: {
        layerHeader: 'text', layerTail: 'text',
        layerConfigs: {text: {id: 'text', type: 'BaseText', name: 'Text', x: 0, y: 0, width: 100, height: 30}},
        elemConfigs: {text: cloneDeep(initialConfig)},
    }}, DesignerMode.EDIT);
    const controller = new BaseTextController();
    controller.config = cloneDeep(initialConfig) as never;
    runInAction(() => { manager.layerManager.controllers.text = controller; });
    context.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);

    let sceneAvailable = true;
    let sessionAvailable = true;
    let draftActive = true;
    let draft: DesignerAiDraftSnapshot | undefined;
    let acceptance: DesignerAiDraftAcceptance | undefined;
    const sceneVersion = context.managerStore.sceneVersion;
    const scene = createEditingScene(manager, sceneVersion, () => sceneAvailable && manager.isRuntimeActive(), undefined, undefined, () => sceneAvailable);
    const history = new HistoryOperator(() => []);
    const draftRenderer = {
        isActive: () => draftActive,
        read: () => draft,
        readAcceptance: () => acceptance,
        clear: vi.fn(() => { draft = undefined; acceptance = undefined; return true; }),
        discardUiBatch: vi.fn(() => true),
        dispose: () => { draftActive = false; },
    } as unknown as DesignerAiDraftRenderer;
    const session = createAiEditingSession({
        scene,
        scope: {rootId: 'project', activeId: 'project', nested: false, loopPath: []},
        isActive: () => sessionAvailable,
        isSceneActive: () => scene.isActive(),
        readSelection: () => ({ids: [], source: 'system'}),
        recordChange: change => options.record === false ? false : history.recordChange(change),
        draftRenderer,
        insertTemplateAtomically: options.insertTemplateAtomically ?? (() => undefined),
    });
    cleanups.push(() => context.dispose(), () => disposeEditingScene(scene), () => session.dispose());
    return {
        manager, context, controller, scene, history, session, draftRenderer,
        setActive(value: boolean) { sessionAvailable = value; sceneAvailable = value; },
        setSessionActive(value: boolean) { sessionAvailable = value; },
        setDraft(value: DesignerAiDraftSnapshot, accepted: DesignerAiDraftAcceptance) { draft = value; acceptance = accepted; },
    };
}

const draftSnapshot = (layerCount = 1): DesignerAiDraftSnapshot => ({
    draftId: 'draft-1', revision: 3, layerCount, interactive: false, batches: [],
});

const acceptance = (): DesignerAiDraftAcceptance => ({
    layers: {
        'source-text': {id: 'source-text', type: 'BaseText', name: 'Text draft', x: 0, y: 0, width: 100, height: 30},
        'source-icon': {id: 'source-icon', type: 'BaseText', name: 'Icon draft', x: 120, y: 0, width: 40, height: 40},
    },
    configs: {'source-text': {base: {id: 'source-text'}}, 'source-icon': {base: {id: 'source-icon'}}},
    componentLayerIds: {title: 'source-text', icon: 'source-icon'},
    componentBindings: {title: 'source-text', icon: 'source-icon'},
});

describe('AI edits through the public editing scene and canvas history', () => {
    it('keeps data undoable and redoable after its AI consumer ends', async () => {
        const {scene, controller, history, session} = fixture();
        const before = scene.layers.read();
        const result = await session.applyComponentPatch([{
            componentId: 'text', componentType: 'BaseText',
            dataPatch: {sourceType: 'static', staticData: {value: [{value: 2}]}},
        }]);
        expect(result.failed).toEqual([]);
        expect(controller.getConfig()?.data?.value).toEqual([{value: 2}]);
        expect(scene.layers.read()?.configs.text).toMatchObject({data: {value: [{value: 2}]}});
        session.dispose();

        expect(history.undo(() => { throw new Error('expected model history'); })).toBe(true);
        expect(scene.layers.read()).toEqual(before);
        expect(controller.getConfig()?.data?.value).toEqual([{value: 1}]);
        expect(history.redo(() => { throw new Error('expected model history'); })).toBe(true);
        expect(controller.getConfig()?.data?.value).toEqual([{value: 2}]);
    });

    it('rolls controller and scene config back when history registration rejects the write', async () => {
        const {scene, controller, history, session} = fixture({record: false});
        const before = scene.layers.read();
        await expect(session.applyComponentPatch([{
            componentId: 'text', componentType: 'BaseText', stylePatch: {style: {color: '#ff0000', newKey: true}},
        }])).rejects.toMatchObject({code: 'history_record_failed'});
        expect(scene.layers.read()).toEqual(before);
        expect(controller.getConfig()?.style).toEqual({color: '#123456'});
        expect(history.undo(() => {})).toBe(false);
    });

    it('does not apply a data patch when its asynchronous normalization finishes after the AI session stops', async () => {
        const {scene, controller, session, setSessionActive} = fixture();
        const before = scene.layers.read();
        let finishNormalization!: (value: unknown) => void;
        vi.spyOn(DataUtil, 'getStaticDataAsync').mockReturnValue(new Promise(resolve => { finishNormalization = resolve; }));

        const pending = session.applyComponentPatch([{
            componentId: 'text', componentType: 'BaseText',
            dataPatch: {sourceType: 'static', staticData: {value: [{value: 2}]}},
        }]);
        await Promise.resolve();
        setSessionActive(false);
        finishNormalization([{value: 2}]);

        await expect(pending).rejects.toMatchObject({code: 'agent_workspace_changed'});
        expect(scene.layers.read()).toEqual(before);
        expect(controller.getConfig()?.data?.value).toEqual([{value: 1}]);
    });

    it('rejects history replay after the bound editing scene changes', () => {
        const {controller, history, session, setActive} = fixture();
        expect(session.applyComponentStylePatch([{
            componentId: 'text', componentType: 'BaseText', stylePatch: {style: {color: '#ff0000'}},
        }]).failed).toEqual([]);
        setActive(false);
        expect(history.undo(() => {})).toBe(false);
        expect(controller.getConfig()?.style?.color).toBe('#ff0000');
    });

    it('removes a component through one scene change and restores it through the same history', () => {
        const {scene, history, session} = fixture();
        const layer = scene.layers.read()?.layers.text;
        const result = session.deleteComponents([{componentId: 'text', componentType: 'BaseText', layer}]);
        expect(result.failed).toEqual([]);
        expect(scene.layers.read()?.layers.text).toBeUndefined();

        expect(history.undo(() => {})).toBe(true);
        expect(scene.layers.read()?.layers.text?.name).toBe('Text');
        expect(scene.layers.read()?.configs.text).toMatchObject({style: {color: '#123456'}});
        expect(history.redo(() => {})).toBe(true);
        expect(scene.layers.read()?.layers.text).toBeUndefined();
    });

    it('passes every component source id to atomic template insertion before clearing a draft', () => {
        const insertTemplateAtomically = vi.fn(() => ({
            appliedLayerIds: ['inserted-text', 'inserted-icon'],
            layerIdMap: {'source-text': 'inserted-text', 'source-icon': 'inserted-icon'},
        }));
        const {session, draftRenderer, setDraft} = fixture({insertTemplateAtomically});
        const accepted = acceptance();
        setDraft(draftSnapshot(2), accepted);

        const result = session.acceptDraft('draft-1', 3);

        expect(insertTemplateAtomically).toHaveBeenCalledWith(
            {layers: accepted.layers, configs: accepted.configs},
            ['source-text', 'source-icon'],
        );
        expect(result).toEqual({
            appliedLayerIds: ['inserted-text', 'inserted-icon'],
            componentBindings: {title: 'inserted-text', icon: 'inserted-icon'},
        });
        expect(draftRenderer.clear).toHaveBeenCalledOnce();
    });

    it('keeps batch draft and history untouched when atomic insertion is incomplete', () => {
        const insertTemplateAtomically = vi.fn(() => ({
            appliedLayerIds: ['inserted-text', 'inserted-icon'],
            layerIdMap: {'source-text': 'inserted-text'},
        }));
        const {session, draftRenderer, history, setDraft} = fixture({insertTemplateAtomically});
        setDraft(draftSnapshot(2), acceptance());

        expect(session.acceptDraftBatch('batch-a')).toEqual([]);
        expect(insertTemplateAtomically).toHaveBeenCalledWith(
            {layers: acceptance().layers, configs: acceptance().configs},
            ['source-text', 'source-icon'],
        );
        expect(draftRenderer.discardUiBatch).not.toHaveBeenCalled();
        expect(history.undo(() => {})).toBe(false);
    });
});
