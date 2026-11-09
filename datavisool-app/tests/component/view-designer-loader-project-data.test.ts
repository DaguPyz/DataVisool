import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

const getProjectData = vi.hoisted(() => vi.fn());

vi.mock('@/api/engineering/BaseApi.ts', () => ({default: {getProjectData}}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({
    default: class {
        mode: unknown;
        projectInfo: {id?: string; name?: string} = {};
        constructor(mode: unknown) { this.mode = mode; }
    },
}));

import ViewDesignerLoader from '@/designer/loader/ViewDesignerLoader.ts';

describe('preview project loading', () => {
    beforeEach(() => getProjectData.mockReset());

    it('returns no project when the authenticated request returns no data', async () => {
        getProjectData.mockResolvedValue(null);
        const loader = new ViewDesignerLoader(DesignerMode.PREVIEW);

        await expect(loader.getProjectData('missing')).resolves.toBeNull();
        expect(loader.projectInfo).toEqual({});
    });

    it('uses the returned project identity for a valid project', async () => {
        const data = {layers: []};
        getProjectData.mockResolvedValue({id: '42', name: '示例项目', data});
        const loader = new ViewDesignerLoader(DesignerMode.PREVIEW);

        await expect(loader.getProjectData('42')).resolves.toEqual({id: '42', name: '示例项目', layers: []});
        expect(loader.projectInfo).toEqual({id: '42', name: '示例项目'});
    });
});
