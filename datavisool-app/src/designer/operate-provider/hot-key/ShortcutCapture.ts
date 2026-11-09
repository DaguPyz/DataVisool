/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {shortcutBindingToHotkeys} from './HotKeyPlatform.ts';
import type {
    ShortcutBinding,
    ShortcutModifier,
    ShortcutPlatform,
    ShortcutTrigger,
} from './ShortcutTypes.ts';

const MODIFIER_CODE_PATTERNS: Array<{
    pattern: RegExp;
    modifier: Exclude<ShortcutModifier, 'primary'>;
}> = [
    {pattern: /^Control(Left|Right)?$/i, modifier: 'control'},
    {pattern: /^Meta(Left|Right)?$/i, modifier: 'meta'},
    {pattern: /^Alt(Left|Right)?$/i, modifier: 'alt'},
    {pattern: /^Shift(Left|Right)?$/i, modifier: 'shift'},
];

const concreteToLogicalModifier = (
    modifier: Exclude<ShortcutModifier, 'primary'>,
    platform: ShortcutPlatform,
): ShortcutModifier => {
    if (platform === 'mac' && modifier === 'meta')
        return 'primary';
    if (platform === 'windows' && modifier === 'control')
        return 'primary';
    return modifier;
};

export const getModifierFromCode = (
    code: string,
    platform: ShortcutPlatform,
): ShortcutModifier | null => {
    const resolved = MODIFIER_CODE_PATTERNS.find(({pattern}) => pattern.test(code))?.modifier;
    return resolved ? concreteToLogicalModifier(resolved, platform) : null;
};

const getEventModifiers = (
    event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    platform: ShortcutPlatform,
): ShortcutModifier[] => {
    const modifiers: ShortcutModifier[] = [];

    if (platform === 'mac') {
        if (event.metaKey) modifiers.push('primary');
        if (event.ctrlKey) modifiers.push('control');
    } else {
        if (event.ctrlKey) modifiers.push('primary');
        if (event.metaKey) modifiers.push('meta');
    }
    if (event.altKey) modifiers.push('alt');
    if (event.shiftKey) modifiers.push('shift');
    return modifiers;
};

export const createCodeBindingFromEvent = (
    event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    platform: ShortcutPlatform,
    trigger: ShortcutTrigger,
): ShortcutBinding | null => {
    if (!event.code || event.code === 'Unidentified' || getModifierFromCode(event.code, platform))
        return null;

    return {
        key: {kind: 'code', code: event.code},
        modifiers: getEventModifiers(event, platform),
        trigger,
    };
};

export const createModifierBinding = (
    code: string,
    platform: ShortcutPlatform,
    trigger: ShortcutTrigger,
): ShortcutBinding | null => {
    const modifier = getModifierFromCode(code, platform);
    if (!modifier || trigger !== 'hold')
        return null;

    return {
        key: {kind: 'modifier', modifier},
        modifiers: [],
        trigger,
    };
};

const resolvedModifierSet = (
    binding: ShortcutBinding,
    platform: ShortcutPlatform,
): Set<Exclude<ShortcutModifier, 'primary'>> => {
    const result = new Set<Exclude<ShortcutModifier, 'primary'>>();
    binding.modifiers.forEach((modifier) => {
        if (modifier === 'primary')
            result.add(platform === 'mac' ? 'meta' : 'control');
        else
            result.add(modifier);
    });
    return result;
};

export const getReservedShortcutReason = (
    binding: ShortcutBinding,
    platform: ShortcutPlatform,
): string | null => {
    if (binding.key.kind === 'modifier') {
        if (platform === 'windows' && binding.key.modifier === 'meta')
            return 'Windows 键由系统占用，不能作为单独快捷键';
        return null;
    }

    const modifiers = resolvedModifierSet(binding, platform);
    const code = binding.key.code;

    if (platform === 'mac') {
        const commandReservedCodes = new Set(['KeyQ', 'KeyW', 'KeyM', 'Tab', 'Space']);
        if (modifiers.has('meta') && commandReservedCodes.has(code))
            return '该组合键由 macOS 保留，不能用于设计器操作';
    } else {
        if (modifiers.has('meta'))
            return 'Windows 键组合由系统占用，不能用于设计器操作';
        if (modifiers.has('alt') && code === 'F4')
            return 'Alt + F4 会关闭窗口，不能用于设计器操作';
        if (modifiers.has('control') && modifiers.has('alt') && code === 'Delete')
            return 'Ctrl + Alt + Delete 由 Windows 保留';
    }

    return null;
};

export const getShortcutBindingValidationError = (
    binding: ShortcutBinding,
    platform: ShortcutPlatform,
): string | null => {
    const reservedReason = getReservedShortcutReason(binding, platform);
    if (reservedReason)
        return reservedReason;
    if (binding.trigger === 'press' && shortcutBindingToHotkeys(binding, platform) === null)
        return '当前按键不能用于命令快捷键';
    return null;
};
