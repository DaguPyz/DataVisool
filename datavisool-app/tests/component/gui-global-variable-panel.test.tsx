/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/comps/common-component/data-source-config/DataSourceConfig.tsx', () => ({default: () => <div>数据源设置</div>}));

import GlobalVariableEditPanel from '@/designer/left/global-variable/GlobalVariableEditPanel';

describe('global variable GUI', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;
    afterEach(() => { window.DATAVISOOL_ENV = previousEnvironment; });

    it('updates the variable name', () => {
        const setEditGlobalVariable = vi.fn();
        window.DATAVISOOL_ENV = {currentManager: {globalVariableManager: {
            editGlobalVariable: {id: 'var-1', key: '原变量', reRender: false},
            setEditGlobalVariable,
            createOrUpdateGlobalVariable: vi.fn(),
            setEditPanelVisible: vi.fn(),
        }}} as never;
        render(<GlobalVariableEditPanel/>);
        fireEvent.change(screen.getByDisplayValue('原变量'), {target: {value: '新变量'}});
        expect(setEditGlobalVariable).toHaveBeenCalledWith(expect.objectContaining({key: '新变量'}));
    });
});
