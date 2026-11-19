/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render as testingRender, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import type {ReactNode} from 'react';
import {ShortcutContext} from '@/plugins/editor-shortcuts/ShortcutContext.ts';
import {createShortcutEffects} from '@/plugins/editor-shortcuts/shortcutEffects.ts';
import {ShortcutStore} from '@/plugins/editor-shortcuts/core/ShortcutStore.ts';
const render = (ui: ReactNode) => testingRender(<ShortcutContext.Provider value={{store: new ShortcutStore(), effects: createShortcutEffects(), readCanvasInput: () => ({pointerTarget: null, contextMenuOpen: false})}}>{ui}</ShortcutContext.Provider>);
import {ShortcutRecorder} from '@/plugins/editor-shortcuts/help/ShortcutRecorder.tsx';

describe('ShortcutRecorder', () => {
    it('在 macOS 上松开 Option 后提交按住动作', () => {
        const onSubmit = vi.fn(() => ({ok: true} as const));
        render(
            <ShortcutRecorder
                platform="mac"
                trigger="hold"
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />,
        );

        fireEvent.keyDown(window, {code: 'AltLeft', altKey: true});
        expect(screen.getByText('Option')).toBeInTheDocument();
        fireEvent.keyUp(window, {code: 'AltLeft'});

        expect(onSubmit).toHaveBeenCalledWith({
            key: {kind: 'modifier', modifier: 'alt'},
            modifiers: [],
            trigger: 'hold',
        });
    });

    it('冲突时保留录入状态并显示冲突动作', () => {
        const onSubmit = vi.fn(() => ({
            ok: false,
            reason: 'conflict',
            conflicts: [{actionId: 'designer.copy' as const, label: '复制组件'}],
        } as const));
        render(
            <ShortcutRecorder
                platform="mac"
                trigger="press"
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />,
        );

        fireEvent.keyDown(window, {code: 'KeyC', metaKey: true});

        expect(screen.getByText('与“复制组件”冲突')).toBeInTheDocument();
        expect(screen.getByLabelText('快捷键录入')).toBeInTheDocument();
    });

    it('命令动作不接受单独修饰键，Esc 可以取消', () => {
        const onSubmit = vi.fn(() => ({ok: true} as const));
        const onCancel = vi.fn();
        render(
            <ShortcutRecorder
                platform="mac"
                trigger="press"
                onSubmit={onSubmit}
                onCancel={onCancel}
            />,
        );

        fireEvent.keyDown(window, {code: 'MetaLeft', metaKey: true});
        fireEvent.keyUp(window, {code: 'MetaLeft'});
        expect(screen.getByText('该操作需要一个普通按键')).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();

        fireEvent.keyDown(window, {code: 'Escape'});
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
