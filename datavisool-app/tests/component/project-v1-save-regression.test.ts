/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const saveMocks = vi.hoisted(() => ({
    updateProject: vi.fn(),
    showSaveError: vi.fn(),
}));

vi.mock('@/api/engineering/BaseApi.ts', () => ({
    default: {updateProject: saveMocks.updateProject},
}));

vi.mock('@datavisool/ui', () => ({
    globalMessage: {messageApi: {error: saveMocks.showSaveError}},
    globalModal: {},
    CheckBox: () => null,
    Input: () => null,
    TextArea: () => null,
}));
vi.mock('@/plugins/editor-canvas/state/EventOperateStore', () => ({default: {}}));
vi.mock('@/plugins/editor-canvas/history/HistoryOperator', () => ({historyOperator: {}}));
vi.mock('@/plugins/editor-canvas/history/HistoryRecordOperateProxy', () => ({default: {}}));
vi.mock('@/plugins/editor-canvas/history/core', () => ({default: {}}));
vi.mock('@/plugins/designer-runtime/internal/designer/store/RuntimeStore.ts', () => ({default: {}}));
vi.mock('@/util/AuthFetchUtil.ts', () => ({default: {}}));
vi.mock('@/util/CoordinateUtil.ts', () => ({default: {}}));
vi.mock('@/util/ExportRiskUtil.ts', () => ({default: {}}));
vi.mock('@/util/ExportSecretUtil.ts', () => ({default: {}, ExportSecretMode: {}}));
vi.mock('@/util/HybridCryptoUtil.ts', () => ({HybridCryptoUtil: {}}));
vi.mock('@/plugins/editor-canvas/layers/LayerUtil.ts', () => ({default: {}}));
vi.mock('@/plugins/editor-canvas/selection/SelectionCommands.ts', () => ({
    canManageSelectedObjects: vi.fn(() => false),
    deleteLayersByIds: vi.fn(),
    resolveSelectedCommandTargetIds: vi.fn(() => []),
    ...Object.fromEntries([
        'selectAll', 'doClone', 'doCopy', 'doLock', 'doUnLock', 'layerToTop', 'layerToBottom',
        'layerMoveUp', 'layerMoveDown', 'doDelete', 'doHide', 'groupLeftAligned',
        'groupRightAligned', 'groupTopAligned', 'groupBottomAligned',
    ].map((name) => [name, vi.fn()])),
}));

import ProjectUtil from '@/util/ProjectUtil.ts';
import ProjectDataCodecUtil from '@/util/ProjectDataCodecUtil.ts';
import {createProjectActions, getSaveData} from '@/plugins/editor-project/projectActions.ts';
import {createProjectSaveStatusStore} from '@/plugins/editor-project/projectSaveStatus.ts';
import type {IDesignerManager} from '@datavisool/sdk/types';

const createProjectData = (): IDesignerManager => ({
    canvasManager: {canvasConfig: {width: 1366, height: 768}} as any,
    themeManager: [{fontFamily: 'V1 Font'}] as any,
    layerManager: {
        elemConfigs: {
            image: {
                base: {id: 'image', type: 'BaseImage'},
                style: {localUrl: 'asset://localhost/C:/project/static/images/photo.png'},
            },
        },
        layerConfigs: {},
        layerHeader: [],
    } as any,
});

const createActions = (hasSnapshot = true, saveStatus = createProjectSaveStatusStore()) => createProjectActions('project-1', {
    loaded: true,
    load: async () => {},
    getProjectId: () => hasSnapshot ? 'project-1' : undefined,
    getSnapshot: () => hasSnapshot ? {id: 'project-1', data: createProjectData()} : undefined,
    readRemoteComponentPaths: () => ({}),
    renderCanvas: () => ({filterStyle: {}, content: null}),
    close() {},
}, write => write(), saveStatus, {isActive: () => true, open: () => true, close: () => {}});

describe('single-artboard V1 persistence regression', () => {
    beforeEach(() => {
        saveMocks.updateProject.mockReset();
        saveMocks.showSaveError.mockReset();
        window.DATAVISOOL_ENV = {definitions: {}, remoteScripts: {}} as any;
    });

    afterEach(() => {
        delete (window as any).DATAVISOOL_ENV;
    });

    it('serializes the manager document as the original V1 shape when saving', () => {
        const data = createProjectData();
        const saveData = getSaveData({getSnapshot: () => ({id: 'project-1', data})});

        expect(saveData?.id).toBe('project-1');
        const stored = JSON.parse(ProjectDataCodecUtil.decompressIfNeeded(saveData!.dataJson));
        expect(stored).toEqual(data);
        expect(stored).not.toHaveProperty('version');
        expect(stored).not.toHaveProperty('artboards');
    });

    it('exports dependencies from one V1 manager and keeps its JSON shape', () => {
        const data = createProjectData();

        const dependency = ProjectUtil.calculateProjectDependencyByProject('project-1', 'V1 Project', data);

        expect(dependency.images).toEqual(['photo.png']);
        expect(dependency.fonts).toEqual(['V1 Font']);
        expect(JSON.parse(dependency.projectJson)).toEqual(data);
        expect(JSON.parse(dependency.projectJson)).not.toHaveProperty('artboards');
    });

    it('preserves current package paths when exporting resources', () => {
        const data = createProjectData();
        const configs = data.layerManager.elemConfigs as any;
        configs.image.style.localUrl = '/static/images/photo.png';
        configs.video = {base: {id: 'video', type: 'BaseVideo'}, style: {src: '/static/videos/clip.mp4?version=1#t=3'}};
        configs.model = {base: {id: 'model', type: 'ThreeModel'}, style: {source: {url: '/static/models/package/scene.glb?version=1'}}};
        configs.remote = {base: {id: 'remote', type: 'CustomChart'}};
        const dependency = ProjectUtil.calculateProjectDependencyByProject('project-1', 'Example', data, {
            CustomChart: '/static/components/package/index.js?version=1',
        });
        expect(dependency.images).toEqual(['photo.png']);
        expect(dependency.videos).toEqual(['clip.mp4']);
        expect(dependency.models).toEqual(['package/scene.glb']);
        expect(dependency.components).toEqual(['package/index.js']);
    });

    it('calculates detached project dependencies from explicit inputs without reading the active editor', () => {
        const data = createProjectData();
        (data.layerManager.elemConfigs as any).remote = {base: {id: 'remote', type: 'CustomChart'}};
        Object.defineProperty(window, 'DATAVISOOL_ENV', {
            configurable: true,
            get() { throw new Error('The active editor must not be read'); },
        });
        const dependency = ProjectUtil.calculateProjectDependencyByProject('other-project', 'Detached', data, {
            CustomChart: '/static/components/other/chart.js',
        });
        expect(dependency).toMatchObject({id: 'other-project', name: 'Detached', components: ['other/chart.js']});
        expect(JSON.parse(dependency.projectJson)).toEqual(data);
        expect(ProjectUtil.calculateProjectDependencyByProject('other-project', 'Detached', data).components).toEqual([]);
    });

    it('includes local video posters in both export and release image dependencies', async () => {
        const data = createProjectData();
        const configs = data.layerManager.elemConfigs as any;
        configs.video = {base: {type: 'BaseVideo'}, style: {poster: '/static/images/poster.png?x=1'}};
        configs.external = {base: {type: 'BaseVideo'}, style: {poster: 'https://example.test/static/images/external.png'}};
        const exported = ProjectUtil.calculateProjectDependencyByProject('project-1', 'Example', data);
        const released: any[] = [];
        await ProjectUtil.cyclicBuildReleaseDependencies({id: 'project-1', name: 'Example', data} as any, released);
        expect(exported.images).toEqual(['photo.png', 'poster.png']);
        expect(released[0].images).toEqual(exported.images);
    });

    it('exports canonical static resource paths without changing the open project or unrelated text', () => {
        const data = createProjectData();
        const configs = data.layerManager.elemConfigs as any;
        configs.image.style = {type: 'online', onLineUrl: '/static/images/online.png?size=1'};
        configs.image.data = {sourceType: 'static', staticData: {value: {data: {url: '/static/images/nested.png'}}}};
        configs.video = {base: {type: 'BaseVideo'}, style: {src: '/static/videos/clip.mp4', poster: '/static/images/poster.png'}};
        configs.model = {base: {type: 'ThreeModel'}, style: {source: {url: '/static/models/scene/index.glb'}}};
        configs.text = {base: {type: 'BaseText'}, data: {value: 'static/images/not-a-resource.png'}};
        const dependency = ProjectUtil.calculateProjectDependencyByProject('project-1', 'Example', data);
        const exported = JSON.parse(dependency.projectJson).layerManager.elemConfigs;
        expect(dependency.images).toEqual(['online.png', 'nested.png', 'poster.png']);
        expect(exported.image.style.onLineUrl).toBe('/static/images/online.png?size=1');
        expect(exported.image.data.staticData.value.data.url).toBe('/static/images/nested.png');
        expect(exported.video.style.src).toBe('/static/videos/clip.mp4');
        expect(exported.video.style.poster).toBe('/static/images/poster.png');
        expect(exported.model.style.source.url).toBe('/static/models/scene/index.glb');
        expect(exported.text.data.value).toBe('static/images/not-a-resource.png');
        expect(configs.video.style.src).toBe('/static/videos/clip.mp4');
    });

    it.each([
        ['image', {base: {type: 'BaseImage'}, style: {localUrl: 'static/images/a.png'}}],
        ['nested image', {base: {type: 'BaseImage'}, data: {sourceType: 'static', value: {url: 'static/images/a.png'}}}],
        ['video', {base: {type: 'BaseVideo'}, style: {src: 'static/videos/a.mp4'}}],
        ['poster', {base: {type: 'BaseVideo'}, style: {poster: 'static/images/a.png'}}],
        ['model', {base: {type: 'ThreeModel'}, style: {source: {url: 'static/models/a.glb'}}}],
    ])('rejects old %s resource paths during export and release', async (_name, config) => {
        const data = createProjectData();
        (data.layerManager.elemConfigs as any).old = config;
        const before = JSON.stringify(data);
        expect(() => ProjectUtil.calculateProjectDependencyByProject('project-1', 'Example', data)).toThrow('静态资源地址必须以 /static/ 开头');
        await expect(ProjectUtil.cyclicBuildReleaseDependencies({id: 'project-1', name: 'Example', data} as any, [])).rejects.toThrow('静态资源地址必须以 /static/ 开头');
        expect(JSON.stringify(data)).toBe(before);
    });

    it('collects nested static image sources without treating remote URLs as local files', () => {
        const data = createProjectData();
        const configs = data.layerManager.elemConfigs as any;
        configs.image.style.localUrl = 'https://cdn.example.test/static/images/external.png';
        configs.image.data = {
            sourceType: 'static',
            staticData: {value: {data: {url: 'asset://localhost/%2Ftmp%2Fstatic%2Fimages%2Fnested%2Bone.png?version=1#view'}}},
            value: {src: '/static/images/cached.png?version=2'},
        };
        configs.other = {base: {id: 'other', type: 'BaseImage'}, style: {localUrl: '//cdn.example.test/static/images/other.png'},
            data: {sourceType: 'static', value: {url: 'blob:https://example.test/static/images/not-local.png'}}};
        const dependency = ProjectUtil.calculateProjectDependencyByProject('project-1', 'Example', data);
        expect(dependency.images).toEqual(['nested+one.png', 'cached.png']);
    });

    it('extracts explicit font names from CSS fallback lists for export and release', async () => {
        const data = createProjectData();
        data.themeManager = [
            {fontFamily: '"Poppins", Arial, sans-serif'},
            {fontFamily: "'Wide, Display', system-ui"},
            {fontFamily: '"serif", serif'},
        ] as any;
        const dependency = ProjectUtil.calculateProjectDependencyByProject('project-1', 'Example', data);
        expect(dependency.fonts).toEqual(['Poppins', 'Arial', 'Wide, Display', 'serif']);
        const releases: any[] = [];
        await ProjectUtil.cyclicBuildReleaseDependencies({id: 'project-1', name: 'Example', data} as any, releases);
        expect(releases[0].fonts).toEqual(dependency.fonts);
    });

    it('returns false and reports an error when the save request rejects', async () => {
        saveMocks.updateProject.mockRejectedValueOnce(new Error('network unavailable'));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const saveStatus = createProjectSaveStatusStore();

        await expect(createActions(true, saveStatus).save()).resolves.toBe(false);

        expect(saveMocks.updateProject).toHaveBeenCalledTimes(1);
        expect(saveMocks.showSaveError).toHaveBeenCalledWith('保存失败');
        expect(saveStatus.read()).toMatchObject({saveState:'failed', saving:false});
        consoleError.mockRestore();
    });

    it('shows the saved state only after the request succeeds', async () => {
        let finishSave: (result: boolean) => void = () => {};
        saveMocks.updateProject.mockReturnValueOnce(new Promise<boolean>((resolve) => { finishSave = resolve; }));
        const saveStatus = createProjectSaveStatusStore();

        const saving = createActions(true, saveStatus).save();
        expect(saveStatus.read()).toMatchObject({saveState:'saving', saving:true});
        finishSave(true);
        await expect(saving).resolves.toBe(true);
        expect(saveStatus.read()).toMatchObject({saveState:'saved', saving:false});
        expect(saveStatus.read().latestSaveTime).not.toBe('');
    });

    it('settles save state after a pause is canceled while the request is in flight', async () => {
        let finishSave: (result: boolean) => void = () => {};
        let accepting = true;
        saveMocks.updateProject.mockReturnValueOnce(new Promise<boolean>((resolve) => { finishSave = resolve; }));
        const saveStatus = createProjectSaveStatusStore();
        const actions = createProjectActions('project-1', {
            loaded: true,
            load: async () => {},
            getProjectId: () => 'project-1',
            getSnapshot: () => ({id: 'project-1', data: createProjectData()}),
            readRemoteComponentPaths: () => ({}),
            renderCanvas: () => ({filterStyle: {}, content: null}),
            close() {},
        } as any, write => write(), saveStatus, {
            isActive: () => accepting,
            open: () => true,
            close: () => {},
        });

        const saving = actions.save();
        expect(saveStatus.read()).toMatchObject({saveState:'saving', saving:true});
        accepting = false;
        expect(saveStatus.read()).toMatchObject({saveState:'saving', saving:true});
        accepting = true;
        finishSave(true);
        await expect(saving).resolves.toBe(true);
        expect(saveStatus.read()).toMatchObject({saveState:'saved', saving:false});
    });

    it('leaves the save status failed when the server rejects the update', async () => {
        saveMocks.updateProject.mockResolvedValueOnce(false);
        const saveStatus = createProjectSaveStatusStore();
        await expect(createActions(true, saveStatus).save()).resolves.toBe(false);
        expect(saveStatus.read()).toMatchObject({saveState:'failed', latestSaveTime:'', saving:false});
    });

    it('finishes saving when no project data is available', async () => {
        const saveStatus = createProjectSaveStatusStore();
        await expect(createActions(false, saveStatus).save()).resolves.toBe(false);
        expect(saveMocks.updateProject).not.toHaveBeenCalled();
        expect(saveStatus.read()).toMatchObject({saveState:'failed', saving:false});
    });
});
