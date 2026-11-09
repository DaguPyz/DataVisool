/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DataVisoolUIProvider, GlobalMessage, GlobalModal, globalMessage, globalModal, useDataVisoolUI} from '@datavisool/ui';
import {exportComponentRuntime} from '@/global/ComponentRuntime';

afterEach(() => {
    act(() => { globalMessage.destroy(); globalModal.destroy(); });
    delete (window as any).DataVisoolSDK;
    delete (window as any).DataVisoolTypes;
    delete (window as any).DataVisoolUI;
});

describe('shared UI application services', () => {
    it('shows and closes feedback created through the component runtime', async () => {
        exportComponentRuntime();
        render(<DataVisoolUIProvider><GlobalMessage/><GlobalModal/></DataVisoolUIProvider>);
        const onOk = vi.fn();
        act(() => {
            window.DataVisoolUI.globalMessage.open({key: 'message', content: 'Saved', duration: 0});
            window.DataVisoolUI.globalModal.modalApi.confirm({title: 'Confirm', content: 'Continue?', okText: 'Continue', onOk});
        });
        expect(screen.getByText('Saved')).toBeTruthy();
        expect(screen.getByText('Confirm')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', {name: 'Continue'}));
        await waitFor(() => expect(onOk).toHaveBeenCalledOnce());
        await waitFor(() => expect(screen.queryByText('Confirm')).toBeNull());
        act(() => globalMessage.destroy('message'));
        expect(screen.queryByText('Saved')).toBeNull();
    });

    it('updates the shared locale and translator for component consumers', () => {
        function Consumer() {
            const {locale, translate} = useDataVisoolUI();
            return <span>{locale}: {translate?.('Save')}</span>;
        }
        const view = render(<DataVisoolUIProvider locale="en" translate={text => text}><Consumer/></DataVisoolUIProvider>);
        expect(screen.getByText('en: Save')).toBeTruthy();
        view.rerender(<DataVisoolUIProvider locale="zh-CN" translate={() => '保存'}><Consumer/></DataVisoolUIProvider>);
        expect(screen.getByText('zh-CN: 保存')).toBeTruthy();
    });
});
