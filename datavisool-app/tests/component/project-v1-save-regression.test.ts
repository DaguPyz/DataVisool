/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {runInAction} from 'mobx';

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
vi.mock('@/designer/operate-provider/EventOperateStore', () => ({default: {}}));
vi.mock('@/designer/operate-provider/undo-redo/HistoryOperator', () => ({historyOperator: {}}));
vi.mock('@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy', () => ({default: {}}));
vi.mock('@/designer/operate-provider/undo-redo/core', () => ({default: {}}));
vi.mock('@/designer/store/RuntimeStore.ts', () => ({default: {}}));
vi.mock('@/designer/left/layer-list/LayerListStore.ts', () => ({default: {}}));
vi.mock('@/util/AuthFetchUtil.ts', () => ({default: {}}));
vi.mock('@/util/CoordinateUtil.ts', () => ({default: {}}));
vi.mock('@/designer/manager/ManagerStore.ts', () => ({default: {currentFinalManager: null}}));
vi.mock('@/designer/header/DesignerHeaderStore.ts', () => ({default: {}}));
vi.mock('@/designer/right/RightStore.ts', () => ({default: {}}));
vi.mock('@/designer/left/DesignerLeftStore.ts', () => ({default: {}}));
vi.mock('@/util/ExportRiskUtil.ts', () => ({default: {}}));
vi.mock('@/util/ExportSecretUtil.ts', () => ({default: {}, ExportSecretMode: {}}));
vi.mock('@/util/HybridCryptoUtil.ts', () => ({HybridCryptoUtil: {}}));
vi.mock('@/designer/left/layer-list/util/LayerUtil.ts', () => ({default: {}}));
vi.mock('@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy', () => ({default: {}}));
vi.mock('@/designer/operate-provider/selection/SelectionCommands.ts', () => ({
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
import {doSave, getSaveData} from '@/designer/operate-provider/hot-key/HotKeyImpl.ts';
import managerStore from '@/designer/manager/ManagerStore.ts';
import footerStore from '@/designer/footer/FooterStore.ts';
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

describe('single-artboard V1 persistence regression', () => {
    beforeEach(() => {
        saveMocks.updateProject.mockReset();
        saveMocks.showSaveError.mockReset();
        footerStore.resetSaveState();
        window.DATAVISOOL_ENV = {definitions: {}, remoteScripts: {}} as any;
    });

    afterEach(() => {
        runInAction(() => {
            managerStore.currentFinalManager = null;
        });
        delete (window as any).DATAVISOOL_ENV;
    });

    it('serializes the manager document as the original V1 shape when saving', () => {
        const data = createProjectData();
        const manager = {id: 'project-1', getData: vi.fn(() => data)};
        runInAction(() => {
            managerStore.currentFinalManager = manager as any;
        });

        const saveData = getSaveData();

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
        window.DATAVISOOL_ENV.definitions = {CustomChart: {getBaseInfo: () => ({source: 'remote'})}} as any;
        window.DATAVISOOL_ENV.remoteScripts = {CustomChart: {script: '/static/components/package/index.js?version=1'}};

        const dependency = ProjectUtil.calculateProjectDependencyByProject('project-1', 'Example', data);
        expect(dependency.images).toEqual(['photo.png']);
        expect(dependency.videos).toEqual(['clip.mp4']);
        expect(dependency.models).toEqual(['package/scene.glb']);
        expect(dependency.components).toEqual(['package/index.js']);
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
        const manager = {id: 'project-1', getData: vi.fn(createProjectData)};
        runInAction(() => {
            managerStore.currentFinalManager = manager as any;
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(doSave()).resolves.toBe(false);

        expect(saveMocks.updateProject).toHaveBeenCalledTimes(1);
        expect(saveMocks.showSaveError).toHaveBeenCalledWith('保存失败');
        expect(footerStore.saveState).toBe('failed');
        expect(footerStore.saving).toBe(false);
        consoleError.mockRestore();
    });

    it('shows the saved state only after the request succeeds', async () => {
        let finishSave: (result: boolean) => void = () => {};
        saveMocks.updateProject.mockReturnValueOnce(new Promise<boolean>((resolve) => { finishSave = resolve; }));
        managerStore.currentFinalManager = {id: 'project-1', getData: createProjectData} as any;

        const saving = doSave();
        expect(footerStore.saveState).toBe('saving');
        expect(footerStore.saving).toBe(true);
        finishSave(true);
        await expect(saving).resolves.toBe(true);
        expect(footerStore.saveState).toBe('saved');
        expect(footerStore.latestSaveTime).not.toBe('');
        expect(footerStore.saving).toBe(false);
    });

    it('leaves the save status failed when the server rejects the update', async () => {
        saveMocks.updateProject.mockResolvedValueOnce(false);
        managerStore.currentFinalManager = {id: 'project-1', getData: createProjectData} as any;
        await expect(doSave()).resolves.toBe(false);
        expect(footerStore.saveState).toBe('failed');
        expect(footerStore.latestSaveTime).toBe('');
        expect(footerStore.saving).toBe(false);
    });

    it('finishes saving when no project data is available', async () => {
        managerStore.currentFinalManager = null;
        await expect(doSave()).resolves.toBe(false);
        expect(saveMocks.updateProject).not.toHaveBeenCalled();
        expect(footerStore.saveState).toBe('failed');
        expect(footerStore.saving).toBe(false);
    });
});
