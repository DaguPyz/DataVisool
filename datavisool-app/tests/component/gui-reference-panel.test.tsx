/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/util/AuthFetchUtil.ts', () => ({
    default: {get: vi.fn(async () => [{id: 'other-project', name: '另一个项目'}])},
}));

import {ScreenReferenceConfig} from '@/comps/builtin/screen-reference/ScreenReferenceConfig';
import AuthFetchUtil from '@/util/AuthFetchUtil';

describe('screen reference GUI', () => {
    beforeEach(() => vi.mocked(AuthFetchUtil.get).mockClear());

    it('updates the referenced project after selecting a search result', async () => {
        const controller = {getConfig: () => ({style: {screenId: ''}}), update: vi.fn()};
        render(<ScreenReferenceConfig controller={controller as never}/>);
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(await screen.findByText('另一个项目'));
        expect(controller.update).toHaveBeenCalledWith({style: {screenId: 'other-project'}});
    });

    it('sends special characters in the search as part of the search value', async () => {
        const controller = {getConfig: () => ({style: {screenId: 'one&two'}}), update: vi.fn()};
        render(<ScreenReferenceConfig controller={controller as never}/>);
        const input = screen.getByRole('combobox');
        fireEvent.click(input);
        fireEvent.change(screen.getByPlaceholderText('请选择'), {target: {value: 'a&b=中文'}});
        await waitFor(() => {
            const calls = vi.mocked(AuthFetchUtil.get).mock.calls;
            const url = calls.map(([path]) => new URL(String(path), 'http://localhost'))
                .find(value => value.searchParams.get('search') === 'a&b=中文');
            expect(url?.searchParams.get('current')).toBe('one&two');
            expect(url?.searchParams.has('b')).toBe(false);
        });
    });
});
