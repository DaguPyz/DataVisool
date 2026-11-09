/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

const {post} = vi.hoisted(() => ({post: vi.fn()}));
vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
    }, configurable: true});
});
vi.mock('@/util/FetchUtil.ts', () => ({default: {post}}));
vi.mock('@/util/HybridCryptoUtil.ts', () => ({HybridCryptoUtil: {encryptRequest: vi.fn()}}));
vi.mock('@/designer/manager/DesignerManager.ts', () => ({default: class DesignerManager {}}));
vi.mock('@/designer/left/compoent-lib/ComponentCategorize.ts', () => ({componentCategorize: []}));
vi.mock('@/framework/core/AbstractDesignerDefinition.ts', () => ({default: class AbstractDesignerDefinition {}}));
vi.mock('@/designer/blueprint/util/EventUtil.ts', () => ({default: {}}));
vi.mock('@/api/engineering/BaseApi.ts', () => ({default: {}}));
vi.mock('@/util/AuthFetchUtil.ts', () => ({default: {}}));

import DesignerLoader from '@/designer/loader/DesignerLoader';
import ReleaseDesignerLoader from '@/designer/loader/ReleaseDesignerLoader';

const bundle = (name: string) => ({name, dataJson: JSON.stringify({projectJson: JSON.stringify({name})})});
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return {promise, resolve};
};

describe('released project loading', () => {
    beforeEach(() => post.mockReset());
    afterEach(() => {
        document.querySelectorAll('script[src*="synthetic-release-script"]').forEach(script => script.remove());
        vi.restoreAllMocks();
    });

    it('accepts absent or null optional script lists and rejects invalid ones', async () => {
        const loader = new ReleaseDesignerLoader(DesignerMode.RELEASE);
        for (const projectBundle of [null, {}, {dynamicScripts: null}, {dynamicScripts: []}]) {
            loader.projectBundle = projectBundle;
            await expect(loader.loadDynamicScript()).resolves.toBeUndefined();
        }
        loader.projectBundle = {dynamicScripts: {value: 'invalid'}};
        await expect(loader.loadDynamicScript()).rejects.toThrow('动态脚本配置无效');
    });

    it('waits for a listed script before continuing', async () => {
        const loader = new ReleaseDesignerLoader(DesignerMode.RELEASE);
        loader.projectBundle = {dynamicScripts: [{value: '/static/scripts/synthetic-release-script.js'}]};
        let finished = false;
        const loading = loader.loadDynamicScript().then(() => { finished = true; });
        const script = document.querySelector('script[src*="synthetic-release-script"]')!;
        expect(script).not.toBeNull();
        expect(finished).toBe(false);
        script.dispatchEvent(new Event('load'));
        await loading;
        expect(finished).toBe(true);
    });

    it('rejects a missing referenced release and retains the identity of a successful one', async () => {
        const parent = vi.spyOn(DesignerLoader.prototype, 'simpleLoad').mockResolvedValue();
        const loader = new ReleaseDesignerLoader(DesignerMode.RELEASE);
        post.mockResolvedValueOnce(null).mockResolvedValueOnce(bundle('Child'));
        await expect(loader.simpleLoad('missing')).rejects.toThrow('未获取到引用的发布项目数据');
        expect(parent).not.toHaveBeenCalled();
        await loader.simpleLoad('child-42');
        expect(parent).toHaveBeenCalledOnce();
        expect(await loader.getProjectData('child-42')).toMatchObject({id: 'child-42', name: 'Child'});
    });

    it('ignores an older response after a different release starts loading', async () => {
        const first = deferred<any>(), second = deferred<any>();
        post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const parent = vi.spyOn(DesignerLoader.prototype, 'load').mockResolvedValue();
        const loader = new ReleaseDesignerLoader(DesignerMode.RELEASE);
        const oldLoad = loader.load('old');
        const newLoad = loader.load('new');
        second.resolve(bundle('New'));
        await newLoad;
        first.resolve(bundle('Old'));
        await oldLoad;
        expect(parent).toHaveBeenCalledOnce();
        expect(parent).toHaveBeenCalledWith('new');
        expect(loader.projectInfo).toEqual({id: 'new', name: 'New'});
        expect(JSON.parse(loader.projectBundle.projectJson).name).toBe('New');
    });
});
