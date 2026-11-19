/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

const normalizeDataConfigAsyncMock = vi.hoisted(() => vi.fn());

vi.mock('@/comps/common-component/data-source-config/DataSourceConfig.tsx', () => ({
    default: ({onSave}: {onSave: (data: object) => void}) =>
        <button onClick={() => onSave({sourceType: 'static', staticData: {value: 12}})}>保存</button>,
}));
vi.mock('@/util/DataSourceConfigUtil.ts', () => ({normalizeDataConfigAsync: normalizeDataConfigAsyncMock}));

import GlobalVariableEditPanel from '@/plugins/editor-variables/GlobalVariableEditPanel';

describe('global variable GUI', () => {
    it('submits the edited name and normalized static value', async () => {
        const onSave = vi.fn();
        normalizeDataConfigAsyncMock.mockResolvedValue({sourceType: 'static', staticData: {value: 12}, value: 12});
        render(<GlobalVariableEditPanel initialValue={{id: 'var-1', key: '原变量', reRender: false}} onSave={onSave} onClose={vi.fn()} canEdit={() => true} trackTask={task => task}/>);
        fireEvent.change(screen.getByDisplayValue('原变量'), {target: {value: '新变量'}});
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({key: '新变量', value: 12})));
    });

    it('does not save a normalization result after the variables plugin pauses', async () => {
        const onSave = vi.fn();
        let accepting = true;
        let resolveNormalization!: (value: unknown) => void;
        normalizeDataConfigAsyncMock.mockReturnValue(new Promise(resolve => { resolveNormalization = resolve; }));
        render(<GlobalVariableEditPanel initialValue={{id: 'var-1', key: '原变量', reRender: false}} onSave={onSave} onClose={vi.fn()} canEdit={() => accepting} trackTask={task => task}/>);
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        await waitFor(() => expect(normalizeDataConfigAsyncMock).toHaveBeenCalled());
        accepting = false;
        await act(async () => {
            resolveNormalization({sourceType: 'static', staticData: {value: 99}, value: 99});
            await Promise.resolve();
        });
        expect(onSave).not.toHaveBeenCalled();
    });
});
