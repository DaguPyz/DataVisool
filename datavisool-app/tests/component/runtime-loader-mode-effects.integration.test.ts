/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

const api = vi.hoisted(() => ({
    getProjectData: vi.fn(),
    releasePost: vi.fn(),
}));

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

vi.mock('@/api/engineering/BaseApi.ts', () => ({
    default: {getProjectData: api.getProjectData},
}));
vi.mock('@/util/FetchUtil.ts', () => ({
    default: {post: api.releasePost},
}));

import DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts';
import EditDesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/EditDesignerLoader.ts';
import ViewDesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/ViewDesignerLoader.ts';
import ReleaseDesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/ReleaseDesignerLoader.ts';
import {BaseTextController} from '@/comps/builtin/base-text/BaseTextController.ts';

const initialEnvironment = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
const activeLoaders: DesignerLoader[] = [];

afterEach(() => {
    activeLoaders.splice(0).reverse().forEach(loader => {
        try { loader.cancelLoad(); } catch { /* Keep cleanup independent between loader fixtures. */ }
        try { loader.runtimeContext.dispose(); } catch { /* Keep cleanup independent between loader fixtures. */ }
    });
    vi.useRealTimers();
    if (initialEnvironment) Object.defineProperty(window, 'DATAVISOOL_ENV', initialEnvironment);
    else Reflect.deleteProperty(window, 'DATAVISOOL_ENV');
    api.getProjectData.mockReset();
    api.releasePost.mockReset();
    vi.restoreAllMocks();
});

const projectData = (id: string) => ({
    id,
    name: `embedded ${id}`,
    canvasManager: {width: 800, height: 600},
    layerManager: {
        layerHeader: 'component',
        layerTail: 'component',
        layerConfigs: {
            component: {id: 'component', type: 'BaseText', name: 'Text', x: 0, y: 0, width: 100, height: 30},
        },
        elemConfigs: {
            component: {base: {id: 'component', type: 'BaseText', name: 'Text'}, data: {sourceType: 'static', value: 'ready'}},
        },
    },
    bluePrintManager: [{
        pageId: 'runtime-events',
        pageName: 'Runtime events',
        bpNodeLayoutMap: {
            global: {id: 'global', type: 'BPGlobalNode'},
            timer: {id: 'timer', type: 'BPTimerNode'},
        },
        bpNodeConfigMap: {
            global: {id: 'global'},
            timer: {id: 'timer', interval: 60, loop: false},
        },
        bpLines: {},
        bpAPMap: {},
        bpAPLineMap: {},
    }],
    globalVariableManager: {globalVariables: {
        automatic: {id: 'automatic', key: 'automatic', value: null, bindTarget: [], reRender: false},
    }},
});

function installReadyRuntimeFixtures(loader: DesignerLoader) {
    const triggerComponentEvent = vi.fn();
    const startAutomaticVariable = vi.fn();
    const initializeRuntimeEnv = loader.initializeRuntimeEnv.bind(loader);
    class BlueprintFixtureController {
        constructor(_config: unknown) {}
        destroy() {}
    }
    loader.runtimeContext.registry.blueprintControllers.BPGlobalNode = BlueprintFixtureController as never;
    loader.runtimeContext.registry.blueprintControllers.BPTimerNode = BlueprintFixtureController as never;
    vi.spyOn(loader, 'loadFonts').mockImplementation(() => undefined);
    vi.spyOn(loader, 'loadDynamicScript').mockResolvedValue();
    vi.spyOn(loader, 'loadRemoteComponents').mockResolvedValue();
    vi.spyOn(loader, 'scanComponents').mockImplementation(() => undefined);
    vi.spyOn(loader, 'scanBPController').mockResolvedValue();
    vi.spyOn(loader, 'initializeRuntimeEnv').mockImplementation((projectId, manager) => {
        initializeRuntimeEnv(projectId, manager);
        const controller = new BaseTextController();
        controller.config = {base: {id: 'component', type: 'BaseText', name: 'Text'}} as never;
        controller.index = 0;
        manager.layerManager.controllers.component = controller;
        manager.bpExecutor.triggerComponentEvent = triggerComponentEvent;
        manager.globalVariableManager.globalVariableInstance.automatic.start = startAutomaticVariable as never;
    });
    return {triggerComponentEvent, startAutomaticVariable};
}

function configureProjectSource(loader: DesignerLoader) {
    if (loader instanceof ReleaseDesignerLoader) {
        api.releasePost.mockResolvedValueOnce({
            name: 'Published project',
            dataJson: JSON.stringify({
                projectJson: JSON.stringify(projectData('embedded-release-id')),
                dynamicScripts: [], components: [], fonts: [],
            }),
        });
        return;
    }
    api.getProjectData.mockResolvedValueOnce({
        id: 'api-project-id', name: 'API project', data: projectData('embedded-api-id'),
    });
}

describe('runtime mode effects through project loaders', () => {
    it('loads EDIT data from the editor API without starting automatic runtime events', async () => {
        vi.useFakeTimers();
        window.DATAVISOOL_ENV = {} as never;
        const loader = new EditDesignerLoader(DesignerMode.EDIT);
        activeLoaders.push(loader);
        const {triggerComponentEvent, startAutomaticVariable} = installReadyRuntimeFixtures(loader);
        configureProjectSource(loader);

        await loader.load('project-id');
        await vi.advanceTimersByTimeAsync(200);

        expect(api.getProjectData).toHaveBeenCalledOnce();
        expect(api.releasePost).not.toHaveBeenCalled();
        expect(loader.designerManager.id).toBe('api-project-id');
        expect(loader.loaded).toBe(true);
        expect(triggerComponentEvent).not.toHaveBeenCalled();
        expect(startAutomaticVariable).not.toHaveBeenCalled();
    });

    it('loads PREVIEW data from the project API and starts loaded, global, and timer effects', async () => {
        vi.useFakeTimers();
        window.DATAVISOOL_ENV = {} as never;
        const loader = new ViewDesignerLoader(DesignerMode.PREVIEW);
        activeLoaders.push(loader);
        const {triggerComponentEvent, startAutomaticVariable} = installReadyRuntimeFixtures(loader);
        configureProjectSource(loader);

        await loader.load('project-id');
        await vi.advanceTimersByTimeAsync(50);

        expect(api.getProjectData).toHaveBeenCalledOnce();
        expect(api.releasePost).not.toHaveBeenCalled();
        expect(loader.designerManager.id).toBe('api-project-id');
        expect(loader.loaded).toBe(true);
        expect(triggerComponentEvent).toHaveBeenCalledWith('component', 'loaded', expect.anything(), 0);
        expect(triggerComponentEvent).toHaveBeenCalledWith('global', 'allLoaded', null);
        expect(triggerComponentEvent).toHaveBeenCalledWith('timer', 'scheduledExecute', null);
        expect(startAutomaticVariable).toHaveBeenCalledOnce();
    });

    it('loads RELEASE data from its bundle and starts the same runtime effects', async () => {
        vi.useFakeTimers();
        window.DATAVISOOL_ENV = {} as never;
        const loader = new ReleaseDesignerLoader(DesignerMode.RELEASE);
        activeLoaders.push(loader);
        const {triggerComponentEvent, startAutomaticVariable} = installReadyRuntimeFixtures(loader);
        configureProjectSource(loader);

        await loader.load('release-id');
        await vi.advanceTimersByTimeAsync(50);

        expect(api.releasePost).toHaveBeenCalledOnce();
        expect(api.releasePost).toHaveBeenCalledWith('/api/release/getReleaseData', expect.objectContaining({id: 'release-id'}), expect.anything());
        expect(api.getProjectData).not.toHaveBeenCalled();
        expect(loader.designerManager.id).toBe('release-id');
        expect(loader.loaded).toBe(true);
        expect(triggerComponentEvent).toHaveBeenCalledWith('component', 'loaded', expect.anything(), 0);
        expect(triggerComponentEvent).toHaveBeenCalledWith('global', 'allLoaded', null);
        expect(triggerComponentEvent).toHaveBeenCalledWith('timer', 'scheduledExecute', null);
        expect(startAutomaticVariable).toHaveBeenCalledOnce();
    });
});
