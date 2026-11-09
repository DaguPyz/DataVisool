/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from 'vitest';
import {
    getShortcutDefinition,
    isKeyboardShortcutDefinition,
    resolveDefaultBinding,
    shortcutContextsOverlap,
    shortcutDefinitions,
} from '@/designer/operate-provider/hot-key/ShortcutRegistry.ts';
import {
    getShortcutBindingConflictKey,
    getShortcutDisplayParts,
    shortcutBindingToHotkeys,
} from '@/designer/operate-provider/hot-key/HotKeyPlatform.ts';
import {SHORTCUT_ACTION_IDS} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';

describe('ShortcutRegistry', () => {
    it('完整注册42个命令、6个按住动作和3个只读指南', () => {
        const keyboardDefinitions = shortcutDefinitions.filter(isKeyboardShortcutDefinition);
        expect(shortcutDefinitions).toHaveLength(51);
        expect(new Set(shortcutDefinitions.map((definition) => definition.id)).size).toBe(51);
        expect(keyboardDefinitions.filter((definition) => resolveDefaultBinding(definition, 'windows').trigger === 'press')).toHaveLength(42);
        expect(keyboardDefinitions.filter((definition) => resolveDefaultBinding(definition, 'windows').trigger === 'hold')).toHaveLength(6);
        expect(shortcutDefinitions.filter((definition) => definition.kind === 'guide')).toHaveLength(3);
    });

    it('按平台解析Primary和删除快捷键', () => {
        const save = getShortcutDefinition(SHORTCUT_ACTION_IDS.SAVE);
        const deletion = getShortcutDefinition(SHORTCUT_ACTION_IDS.DELETE);
        expect(save.kind).toBe('shortcut');
        expect(deletion.kind).toBe('shortcut');
        if (save.kind !== 'shortcut' || deletion.kind !== 'shortcut') return;

        expect(shortcutBindingToHotkeys(resolveDefaultBinding(save, 'windows'), 'windows')).toBe('ctrl+s');
        expect(shortcutBindingToHotkeys(resolveDefaultBinding(save, 'mac'), 'mac')).toBe('meta+s');
        expect(shortcutBindingToHotkeys(resolveDefaultBinding(deletion, 'windows'), 'windows')).toBe('delete');
        expect(shortcutBindingToHotkeys(resolveDefaultBinding(deletion, 'mac'), 'mac')).toBe('meta+backspace');
        expect(getShortcutDisplayParts(resolveDefaultBinding(save, 'mac'), 'mac')).toEqual(['Command', 'S']);
    });

    it('默认配置在同一生效上下文中没有冲突', () => {
        for (const platform of ['windows', 'mac'] as const) {
            const definitions = shortcutDefinitions.filter(isKeyboardShortcutDefinition);
            for (let leftIndex = 0; leftIndex < definitions.length; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < definitions.length; rightIndex += 1) {
                    const left = definitions[leftIndex];
                    const right = definitions[rightIndex];
                    const sameBinding = getShortcutBindingConflictKey(resolveDefaultBinding(left, platform), platform)
                        === getShortcutBindingConflictKey(resolveDefaultBinding(right, platform), platform);
                    expect(sameBinding && shortcutContextsOverlap(left.contexts, right.contexts)).toBe(false);
                }
            }
        }
    });

    it('画布选择和拖拽阶段互斥，但设计器上下文覆盖两者', () => {
        expect(shortcutContextsOverlap(['canvas.selection'], ['canvas.drag'])).toBe(false);
        expect(shortcutContextsOverlap(['designer'], ['canvas.drag'])).toBe(true);
        expect(shortcutContextsOverlap(['canvas'], ['canvas.selection'])).toBe(true);
    });
});
