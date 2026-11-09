/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {HotKeyDes} from '@/designer/footer/hotkey-des/HotKeyDes.tsx';

const shortcutStoreMock = vi.hoisted(() => ({
    loadState: 'ready',
    loadError: null,
    saveState: 'idle',
    saveError: null,
    getBinding: vi.fn(() => null),
    isCustomized: vi.fn(() => false),
    beginCapture: vi.fn(() => true),
    endCapture: vi.fn(),
    setBinding: vi.fn(() => ({ok: true} as const)),
    resetBinding: vi.fn(() => ({ok: true} as const)),
    resetAll: vi.fn(() => ({ok: true} as const)),
    retrySave: vi.fn(async () => undefined),
}));

vi.mock('@/designer/operate-provider/hot-key/ShortcutStore.ts', () => ({
    default: shortcutStoreMock,
}));

vi.mock('@datavisool/ui', () => ({
    Dialog: ({title, children}: {title: React.ReactNode; children: React.ReactNode}) => (
        <div>{title}{children}</div>
    ),
    Tag: ({children}: {children: React.ReactNode}) => <span>{children}</span>,
}));

describe('HotKeyDes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('从设置页录入按住类快捷键并暂停其他动作', () => {
        render(<HotKeyDes onClose={vi.fn()}/>);
        const row = screen.getByText('临时完整包含框选').closest('tr')!;

        fireEvent.click(within(row).getByText('修改'));
        expect(shortcutStoreMock.beginCapture).toHaveBeenCalledWith('designer.selection.boxContain');
        fireEvent.keyDown(window, {code: 'AltLeft', altKey: true});
        fireEvent.keyUp(window, {code: 'AltLeft'});

        expect(shortcutStoreMock.setBinding).toHaveBeenCalledWith(
            'designer.selection.boxContain',
            {
                key: {kind: 'modifier', modifier: 'alt'},
                modifiers: [],
                trigger: 'hold',
            },
        );
        expect(screen.getByText('快捷键已更新')).toBeInTheDocument();
    });

    it('支持搜索并要求二次确认全部恢复默认', () => {
        render(<HotKeyDes onClose={vi.fn()}/>);
        fireEvent.change(screen.getByPlaceholderText('输入功能或按键'), {
            target: {value: '临时完整包含'},
        });

        expect(screen.getByText('临时完整包含框选')).toBeInTheDocument();
        expect(screen.queryByText('复制组件')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('全部恢复默认'));
        expect(shortcutStoreMock.resetAll).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('确认恢复全部'));
        expect(shortcutStoreMock.resetAll).toHaveBeenCalledTimes(1);
    });
});
