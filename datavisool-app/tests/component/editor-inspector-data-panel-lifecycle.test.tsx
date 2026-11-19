/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {InspectorDomainContext} from '@/plugins/editor-inspector/InspectorDomainContext.ts';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import {createInspectorTarget} from './support/inspectorDomainFixture.ts';

const mocks = vi.hoisted(() => ({
    props: undefined as any,
    normalize: vi.fn(),
}));

vi.mock('@/comps/common-component/data-source-config/DataSourceConfig.tsx', () => ({
    default: (props: any) => { mocks.props = props; return null; },
}));
vi.mock('@/util/DataSourceConfigUtil.ts', () => ({normalizeDataConfigAsync: mocks.normalize}));

import DataConfigImpl from '@/plugins/editor-inspector/config-panels/DataConfigImpl.tsx';

const makeDomain = () => ({
    sceneVersion: 1,
    isActive: () => true,
    readTarget: () => createInspectorTarget('component-a'),
    createControllerFacade: () => undefined,
    readStatuses: () => ({items: []}),
    applyStatusChange: () => true,
    applyLayerEdit: () => true,
    resetConfig: () => true,
    readDataSourceContext: () => ({staticDataSeedKey: 'component-a'}),
    prepareDataSourceTest: vi.fn((_id: string, _kind: string, config: unknown) => config),
    applyTheme: () => true,
    applyFilter: () => true,
});

describe('Inspector datasource panel lifecycle', () => {
    afterEach(() => {
        mocks.props = undefined;
        mocks.normalize.mockReset();
    });

    it('ignores save and test completions after the panel unmounts', async () => {
        let resolveNormalization!: (value: unknown) => void;
        mocks.normalize.mockReturnValue(new Promise(resolve => { resolveNormalization = resolve; }));
        const domain = makeDomain();
        const target = createInspectorTarget('component-a');
        const store = createInspectorStore();
        const controller = {
            getConfig: () => ({base: {id: 'component-a'}, data: {sourceType: 'static', value: 'before'}}),
            isCurrent: () => true,
            update: vi.fn(),
            changeData: vi.fn(),
        };
        const view = render(
            <InspectorDomainContext.Provider value={{domain: domain as never, target, store, canEdit: () => store.isAccepting, trackTask: task => task}}>
                <DataConfigImpl controller={controller as never}/>
            </InspectorDomainContext.Provider>,
        );

        let pending!: Promise<void>;
        act(() => { pending = mocks.props.onSave({sourceType: 'static', value: 'after'}, 'after'); });
        const callbacks = mocks.props;
        view.unmount();
        await act(async () => { resolveNormalization({sourceType: 'static', value: 'after'}); await pending; });
        callbacks.apiTestAfter('late test result');
        expect(() => callbacks.apiTestBefore({url: 'https://example.test'})).toThrowError(expect.objectContaining({name: 'AbortError'}));
        expect(domain.prepareDataSourceTest).not.toHaveBeenCalled();
        expect(controller.update).not.toHaveBeenCalled();
        expect(controller.changeData).not.toHaveBeenCalled();
    });
});
