/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {StrictMode} from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createInspectorTarget, createInspectorTestDomain} from './support/inspectorDomainFixture.ts';

const pending = vi.hoisted(() => ({props: undefined as any, normalize: vi.fn(), success: vi.fn()}));
vi.mock('@/util/DataSourceConfigUtil.ts', () => ({normalizeDataConfigAsync: pending.normalize}));
vi.mock('@/comps/common-component/data-source-config/DataSourceConfig.tsx', () => ({
    default: (props: unknown) => { pending.props = props; return null; },
}));
vi.mock('@datavisool/ui', () => ({globalMessage: {messageApi: {success: pending.success}}}));

import DataConfigImpl from '@/plugins/editor-inspector/config-panels/DataConfigImpl.tsx';
import {InspectorDomainContext} from '@/plugins/editor-inspector/InspectorDomainContext.ts';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';

function mountPanel() {
    const target = createInspectorTarget('data-component');
    const {domain} = createInspectorTestDomain([target]);
    const controller = {
        getConfig: () => ({base: {id: target.id}, data: {sourceType: 'static', value: 'before'}}),
        isCurrent: () => true,
        update: vi.fn(),
        changeData: vi.fn(),
    };
    const store = createInspectorStore();
    const view = render(<StrictMode><InspectorDomainContext.Provider value={{domain, target, store, canEdit: () => store.isAccepting, trackTask: task => task}}>
        <DataConfigImpl controller={controller as never}/>
    </InspectorDomainContext.Provider></StrictMode>);
    return {...view, controller, callbacks: pending.props, store};
}

afterEach(() => { cleanup(); pending.normalize.mockReset(); pending.success.mockReset(); pending.props = undefined; });

describe('Inspector data panel asynchronous ownership', () => {
    it('discards a save and datasource response that complete after the panel unmounts', async () => {
        let resolve!: (config: unknown) => void;
        pending.normalize.mockImplementation(() => new Promise(done => { resolve = done; }));
        const {controller, callbacks, unmount} = mountPanel();
        let saving!: Promise<void>;
        act(() => { saving = callbacks.onSave({sourceType: 'static', value: 'after'}); });
        expect(pending.normalize).toHaveBeenCalledTimes(1);
        unmount();
        await act(async () => {
            resolve({sourceType: 'static', value: 'after'});
            await saving;
            callbacks.apiTestAfter('late response');
            callbacks.globalVariableTestAfter('late variable');
        });
        expect(controller.update).not.toHaveBeenCalled();
        expect(controller.changeData).not.toHaveBeenCalled();
        expect(() => callbacks.apiTestBefore({url: 'https://example.test'})).toThrow(/no longer active/);
    });

    it('still saves from the active mount after StrictMode replays its effects', async () => {
        pending.normalize.mockResolvedValue({sourceType: 'static', value: 'after'});
        const {controller, callbacks} = mountPanel();
        await act(async () => { await callbacks.onSave({sourceType: 'static', value: 'after'}); });
        expect(controller.update).toHaveBeenCalledWith({data: {sourceType: 'static', value: 'after'}}, {reRender: false});
        expect(controller.changeData).toHaveBeenCalledWith('after');
    });

    it('does not save or report success when normalization finishes after stop pauses the inspector', async () => {
        let resolve!: (config: unknown) => void;
        pending.normalize.mockImplementation(() => new Promise(done => { resolve = done; }));
        const {controller, callbacks, store} = mountPanel();
        let saving!: Promise<void>;
        act(() => { saving = callbacks.onSave({sourceType: 'static', value: 'after'}); });
        store.setAccepting(false);

        await act(async () => {
            resolve({sourceType: 'static', value: 'after'});
            await saving;
        });

        expect(controller.update).not.toHaveBeenCalled();
        expect(controller.changeData).not.toHaveBeenCalled();
        expect(pending.success).not.toHaveBeenCalled();
    });
});
