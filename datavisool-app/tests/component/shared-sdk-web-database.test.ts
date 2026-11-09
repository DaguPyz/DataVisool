/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';
import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';
import type {WebDatabaseConfig} from '@/types/WebDataSourceTypes';

const mocks = vi.hoisted(() => ({post: vi.fn(), parseDatabase: vi.fn()}));
vi.mock('@/util/FetchUtil.ts', () => ({default: {post: mocks.post}}));
vi.mock('@/util/AuthFetchUtil.ts', () => ({default: {post: vi.fn()}}));
vi.mock('@/designer/left/global-variable/parse/ComponentDataGvParser.ts', () => ({
    default: {parseDatabase: mocks.parseDatabase}
}));
vi.mock('@/util/DataUtil.ts', () => ({default: {applyFilterAsync: (data: unknown) => Promise.resolve(data)}}));

describe('Web database fields alongside shared SDK types', () => {
    const previousEnv = window.DATAVISOOL_ENV;
    afterEach(() => { window.DATAVISOOL_ENV = previousEnv; vi.resetAllMocks(); });

    it('sends the Web release data source and variables after parsing the SQL', async () => {
        const result = [{total: 3}];
        mocks.post.mockResolvedValue(result);
        mocks.parseDatabase.mockImplementation((config) => ({...config, sql: 'select 3'}));
        window.DATAVISOOL_ENV = {
            mode: DesignerMode.RELEASE,
            projectId: 'release-1',
            releasePassword: 'test-password',
            currentManager: {globalVariableManager: {globalVariableInstance: {
                region: {key: 'region', getGlobalVariable: () => ({value: 'north'})}
            }}}
        } as any;
        const success = vi.fn();
        const updater = new ComponentDataUpdater(success, vi.fn());
        const database: WebDatabaseConfig = {
            targetDb: 'source-1', runtimeDataSourceId: 'release-source-1', sql: 'select #{region}'
        };
        updater.run({sourceType: 'database', database});
        await waitFor(() => expect(success).toHaveBeenCalledWith(result));
        expect(mocks.post).toHaveBeenCalledWith('/api/release/executeDatabase', {
            releaseId: 'release-1', runtimeDataSourceId: 'release-source-1',
            variables: {region: 'north'}, password: 'test-password'
        });
        updater.destroy();
    });
});
