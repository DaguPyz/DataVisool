/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {getProjectData} = vi.hoisted(() => ({getProjectData: vi.fn()}));
vi.mock('@/api/engineering/BaseApi.ts', () => ({default: {getProjectData}}));

import ProjectUtil from '@/util/ProjectUtil.ts';

const project = (id: string, elemConfigs: Record<string, any> = {}) => ({
    id, name: `project-${id}`, data: {layerManager: {elemConfigs}},
});
const reference = (id: string) => ({base: {type: 'ScreenReference'}, style: {screenId: id}});

describe('release project references', () => {
    beforeEach(() => {
        getProjectData.mockReset();
        window.DATAVISOOL_ENV = {definitions: {}, remoteScripts: {}} as any;
    });
    afterEach(() => { delete (window as any).DATAVISOOL_ENV; });

    it('collects a shared nested reference once and retains the original project data', async () => {
        const child = project('2', {image: {base: {type: 'BaseImage'}, style: {localUrl: '/static/images/example.png'}}});
        const main = project('1', {
            direct: reference('2'),
            loop: {base: {type: 'LoopContainer'}, managerData: {layerManager: {elemConfigs: {nested: reference('2')}}}},
        });
        getProjectData.mockResolvedValue(child);
        const dependencies: any[] = [];
        await ProjectUtil.cyclicBuildReleaseDependencies(main as any, dependencies);
        expect(dependencies.map(item => item.id)).toEqual(['2', '1']);
        expect(getProjectData).toHaveBeenCalledTimes(1);
        expect(dependencies[0].images).toEqual(['example.png']);
        const published = JSON.parse(dependencies[1].projectJson);
        expect(published.layerManager.elemConfigs.direct.style.screenId).toBe('__SCREEN_2__');
        expect(published.layerManager.elemConfigs.loop.managerData.layerManager.elemConfigs.nested.style.screenId).toBe('__SCREEN_2__');
        expect(main.data.layerManager.elemConfigs.direct.style.screenId).toBe('2');
    });

    it('rejects circular references without returning partial dependencies', async () => {
        const main = project('1', {child: reference('2')});
        getProjectData.mockResolvedValue(project('2', {back: reference('1')}));
        const dependencies = [{id: 'existing'}];
        await expect(ProjectUtil.cyclicBuildReleaseDependencies(main as any, dependencies)).rejects.toThrow('大屏引用存在循环：1');
        expect(dependencies).toEqual([{id: 'existing'}]);
    });

    it('rejects a missing or mismatched referenced project without returning partial dependencies', async () => {
        const main = project('1', {child: reference('2')});
        for (const response of [null, project('3')]) {
            getProjectData.mockResolvedValueOnce(response);
            const dependencies: any[] = [];
            await expect(ProjectUtil.cyclicBuildReleaseDependencies(main as any, dependencies)).rejects.toThrow('引用的大屏不存在或无法读取：2');
            expect(dependencies).toEqual([]);
        }
    });
});
