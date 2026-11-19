/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import BaseInfo from '@/plugins/editor-inspector/BaseInfoImpl.tsx';
import {InspectorDomainContext} from '@/plugins/editor-inspector/InspectorDomainContext.ts';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import {createInspectorTarget, createInspectorTestDomain} from './support/inspectorDomainFixture.ts';

describe('inspector base information', () => {
    afterEach(() => vi.useRealTimers());

    it('sends name edits through the injected canvas domain', async () => {
        const target = createInspectorTarget('layer-1', 'sample', '原名称');
        const base = createInspectorTestDomain([target]).domain;
        const applyLayerEdit = vi.fn(() => true);
        const domain = {...base, applyLayerEdit};
        const store = createInspectorStore();
        const controller = {update: vi.fn()};

        render(
            <InspectorDomainContext.Provider value={{domain, target, store, canEdit: () => store.isAccepting, trackTask: task => task}}>
                <BaseInfo controller={controller as never}/>
            </InspectorDomainContext.Provider>,
        );
        fireEvent.change(screen.getByDisplayValue('原名称'), {target: {value: '新名称'}});
        await waitFor(() => expect(applyLayerEdit).toHaveBeenCalledWith('layer-1', {kind: 'rename', name: '新名称'}));
        expect(controller.update).not.toHaveBeenCalled();
    });
});
