/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {runInAction} from 'mobx';
import {SHORTCUT_ACTION_IDS, type ShortcutHandlerMap} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';
import {codeBinding} from '@/designer/operate-provider/hot-key/ShortcutRegistry.ts';
import shortcutStore from '@/designer/operate-provider/hot-key/ShortcutStore.ts';
import HotKey from '@/designer/operate-provider/hot-key/HotKey.tsx';

const hotkeysMock = vi.hoisted(() => {
    const bindings: Array<{key: string; callback: (event: KeyboardEvent) => boolean | void}> = [];
    const bind = Object.assign(vi.fn(), {
        unbind: vi.fn(),
        filter: vi.fn(() => true),
    });
    bind.mockImplementation((key: string, callback: (event: KeyboardEvent) => boolean | void) => {
        bindings.push({key, callback});
    });
    return {bind, bindings};
});

vi.mock('hotkeys-js', () => ({default: hotkeysMock.bind}));

const mapping = (handler: (event: KeyboardEvent) => unknown): ShortcutHandlerMap => ({
    [SHORTCUT_ACTION_IDS.COPY]: {
        handler,
        contexts: ['canvas'],
    },
});

describe('HotKey', () => {
    beforeEach(() => {
        hotkeysMock.bind.mockClear();
        hotkeysMock.bind.unbind.mockClear();
        hotkeysMock.bindings.length = 0;
        runInAction(() => {
            shortcutStore.overrides.clear();
            shortcutStore.capturingActionId = null;
        });
    });

    it('按动作动态重绑，并使用原callback精确解绑', async () => {
        const handler = vi.fn();
        const {unmount} = render(
            <div className="datavisool-ruler-content" tabIndex={-1} data-testid="canvas">
                <HotKey handlerMapping={mapping(handler)}/>
            </div>,
        );
        screen.getByTestId('canvas').focus();

        await waitFor(() => expect(hotkeysMock.bindings.some((item) => item.key === 'ctrl+c')).toBe(true));
        const original = hotkeysMock.bindings.find((item) => item.key === 'ctrl+c')!;
        expect(original.callback(new KeyboardEvent('keydown', {code: 'KeyC', ctrlKey: true}))).toBe(false);
        expect(handler).toHaveBeenCalledTimes(1);

        act(() => {
            runInAction(() => shortcutStore.overrides.set(
                SHORTCUT_ACTION_IDS.COPY,
                codeBinding('KeyQ', ['primary']),
            ));
        });
        await waitFor(() => expect(hotkeysMock.bind.unbind).toHaveBeenCalledWith('ctrl+c', original.callback));
        await waitFor(() => expect(hotkeysMock.bindings.some((item) => item.key === 'ctrl+q')).toBe(true));

        const rebound = hotkeysMock.bindings.find((item) => item.key === 'ctrl+q')!;
        unmount();
        expect(hotkeysMock.bind.unbind).toHaveBeenCalledWith('ctrl+q', rebound.callback);
        expect(shortcutStore.invokeHandlers(
            SHORTCUT_ACTION_IDS.COPY,
            new KeyboardEvent('keydown', {code: 'KeyQ', ctrlKey: true}),
        )).toBe(false);
    });

    it('输入控件中不触发普通设计器命令', async () => {
        const handler = vi.fn();
        render(
            <div className="datavisool-ruler-content">
                <input data-testid="editor-input"/>
                <HotKey handlerMapping={mapping(handler)}/>
            </div>,
        );
        screen.getByTestId('editor-input').focus();
        await waitFor(() => expect(hotkeysMock.bindings.some((item) => item.key === 'ctrl+c')).toBe(true));
        const binding = hotkeysMock.bindings.find((item) => item.key === 'ctrl+c')!;

        expect(binding.callback(new KeyboardEvent('keydown', {code: 'KeyC', ctrlKey: true}))).toBe(true);
        expect(handler).not.toHaveBeenCalled();
    });

    it('录入快捷键期间暂停业务快捷键', async () => {
        const handler = vi.fn();
        render(
            <div className="datavisool-ruler-content" tabIndex={-1} data-testid="canvas">
                <HotKey handlerMapping={mapping(handler)}/>
            </div>,
        );
        screen.getByTestId('canvas').focus();
        await waitFor(() => expect(hotkeysMock.bindings.some((item) => item.key === 'ctrl+c')).toBe(true));
        const binding = hotkeysMock.bindings.find((item) => item.key === 'ctrl+c')!;

        runInAction(() => shortcutStore.capturingActionId = SHORTCUT_ACTION_IDS.COPY);
        expect(binding.callback(new KeyboardEvent('keydown', {code: 'KeyC', ctrlKey: true}))).toBe(true);
        expect(handler).not.toHaveBeenCalled();
    });
});
