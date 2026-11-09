/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from 'vitest';
import {
    createCodeBindingFromEvent,
    createModifierBinding,
    getReservedShortcutReason,
} from '@/designer/operate-provider/hot-key/ShortcutCapture.ts';

describe('ShortcutCapture', () => {
    it('把 macOS Command 记录为逻辑主键并保留 Option', () => {
        const event = new KeyboardEvent('keydown', {
            code: 'KeyX',
            metaKey: true,
            altKey: true,
        });

        expect(createCodeBindingFromEvent(event, 'mac', 'hold')).toEqual({
            key: {kind: 'code', code: 'KeyX'},
            modifiers: ['primary', 'alt'],
            trigger: 'hold',
        });
    });

    it('区分 macOS Command、Control 和 Option 单修饰键', () => {
        expect(createModifierBinding('MetaLeft', 'mac', 'hold')).toEqual({
            key: {kind: 'modifier', modifier: 'primary'},
            modifiers: [],
            trigger: 'hold',
        });
        expect(createModifierBinding('ControlLeft', 'mac', 'hold')).toEqual({
            key: {kind: 'modifier', modifier: 'control'},
            modifiers: [],
            trigger: 'hold',
        });
        expect(createModifierBinding('AltLeft', 'mac', 'hold')).toEqual({
            key: {kind: 'modifier', modifier: 'alt'},
            modifiers: [],
            trigger: 'hold',
        });
        expect(createModifierBinding('AltLeft', 'mac', 'press')).toBeNull();
    });

    it('拒绝平台保留组合键', () => {
        const macClose = createCodeBindingFromEvent(
            new KeyboardEvent('keydown', {code: 'KeyW', metaKey: true}),
            'mac',
            'press',
        )!;
        const windowsClose = createCodeBindingFromEvent(
            new KeyboardEvent('keydown', {code: 'F4', altKey: true}),
            'windows',
            'press',
        )!;
        const existingMacHide = createCodeBindingFromEvent(
            new KeyboardEvent('keydown', {code: 'KeyH', metaKey: true}),
            'mac',
            'press',
        )!;

        expect(getReservedShortcutReason(macClose, 'mac')).toContain('macOS');
        expect(getReservedShortcutReason(windowsClose, 'windows')).toContain('关闭窗口');
        expect(getReservedShortcutReason(existingMacHide, 'mac')).toBeNull();
    });
});
