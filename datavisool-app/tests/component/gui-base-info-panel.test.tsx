/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/designer/right/RightStore', () => ({default: {activeElem: {id: 'layer-1'}}}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: {sample: {getBaseInfo: () => ({})}}}}));

import BaseInfo from '@/comps/common-component/base-info/BaseInfo';

describe('shared GUI base information', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;
    afterEach(() => { window.DATAVISOOL_ENV = previousEnvironment; });

    it('updates the component and layer names', async () => {
        const updateLayer = vi.fn();
        window.DATAVISOOL_ENV = {currentManager: {layerManager: {
            layerConfigs: {'layer-1': {id: 'layer-1', type: 'sample', name: '原名称', x: 0, y: 0, width: 100, height: 100}},
            updateLayer,
        }}} as never;
        const controller = {update: vi.fn()};
        render(<BaseInfo controller={controller as never}/>);
        fireEvent.change(screen.getByDisplayValue('原名称'), {target: {value: '新名称'}});
        await waitFor(() => expect(controller.update).toHaveBeenCalledWith({base: {name: '新名称'}}, {reRender: false}));
        expect(updateLayer).toHaveBeenCalledWith([{id: 'layer-1', name: '新名称'}]);
    });
});
