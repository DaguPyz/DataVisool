/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {
    ShortcutBinding,
    ShortcutKey,
    ShortcutModifier,
    ShortcutPlatform,
} from './ShortcutTypes.ts';

type ConcreteModifier = Exclude<ShortcutModifier, 'primary'>;

const MODIFIER_ORDER: readonly ConcreteModifier[] = ['control', 'meta', 'alt', 'shift'];

export const getShortcutPlatform = (): ShortcutPlatform => {
    if (typeof navigator === 'undefined')
        return 'windows';

    const platform = navigator.platform || '';
    const userAgent = navigator.userAgent || '';
    return /mac/i.test(platform) || /macintosh|mac os x/i.test(userAgent) ? 'mac' : 'windows';
};

export const resolveShortcutModifier = (
    modifier: ShortcutModifier,
    platform: ShortcutPlatform,
): ConcreteModifier => {
    if (modifier === 'primary')
        return platform === 'mac' ? 'meta' : 'control';
    return modifier;
};

export const resolveShortcutModifiers = (
    modifiers: readonly ShortcutModifier[],
    platform: ShortcutPlatform,
): ConcreteModifier[] => {
    const resolved = new Set(modifiers.map((modifier) => resolveShortcutModifier(modifier, platform)));
    return MODIFIER_ORDER.filter((modifier) => resolved.has(modifier));
};

const modifierCode = (code: string): ConcreteModifier | null => {
    if (/^Control(Left|Right)?$/i.test(code)) return 'control';
    if (/^Meta(Left|Right)?$/i.test(code)) return 'meta';
    if (/^Alt(Left|Right)?$/i.test(code)) return 'alt';
    if (/^Shift(Left|Right)?$/i.test(code)) return 'shift';
    return null;
};

export const getResolvedShortcutKeyToken = (
    key: ShortcutKey,
    platform: ShortcutPlatform,
): string => {
    if (key.kind === 'modifier')
        return `modifier:${resolveShortcutModifier(key.modifier, platform)}`;

    const modifier = modifierCode(key.code);
    return modifier ? `modifier:${modifier}` : `code:${key.code}`;
};

export const getShortcutBindingConflictKey = (
    binding: ShortcutBinding,
    platform: ShortcutPlatform,
): string => {
    const modifiers = resolveShortcutModifiers(binding.modifiers, platform).join(',');
    return `${getResolvedShortcutKeyToken(binding.key, platform)}|${modifiers}`;
};

export const getShortcutBindingValueKey = (binding: ShortcutBinding): string => {
    const modifiers = Array.from(new Set(binding.modifiers)).sort().join(',');
    const key = binding.key.kind === 'code'
        ? `code:${binding.key.code}`
        : `modifier:${binding.key.modifier}`;
    return `${binding.trigger}|${key}|${modifiers}`;
};

const codeToHotkeysKey = (code: string): string | null => {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return `num_${code.slice(6)}`;
    if (/^F([1-9]|1[0-9])$/.test(code)) return code.toLowerCase();

    const keys: Record<string, string> = {
        ArrowUp: 'arrowup',
        ArrowDown: 'arrowdown',
        ArrowLeft: 'arrowleft',
        ArrowRight: 'arrowright',
        Backspace: 'backspace',
        Delete: 'delete',
        Enter: 'enter',
        Escape: 'esc',
        End: 'end',
        Home: 'home',
        Insert: 'insert',
        PageDown: 'pagedown',
        PageUp: 'pageup',
        Space: 'space',
        Tab: 'tab',
    };
    return keys[code] ?? null;
};

export const shortcutBindingToHotkeys = (
    binding: ShortcutBinding,
    platform: ShortcutPlatform,
): string | null => {
    if (binding.trigger !== 'press' || binding.key.kind !== 'code')
        return null;

    const key = codeToHotkeysKey(binding.key.code);
    if (!key)
        return null;

    const modifierNames: Record<ConcreteModifier, string> = {
        control: 'ctrl',
        meta: 'meta',
        alt: 'alt',
        shift: 'shift',
    };
    return [...resolveShortcutModifiers(binding.modifiers, platform).map((modifier) => modifierNames[modifier]), key].join('+');
};

const modifierLabel = (modifier: ShortcutModifier, platform: ShortcutPlatform): string => {
    if (modifier === 'primary') return platform === 'mac' ? 'Command' : 'Ctrl';
    if (modifier === 'control') return 'Control';
    if (modifier === 'meta') return platform === 'mac' ? 'Command' : 'Win';
    if (modifier === 'alt') return platform === 'mac' ? 'Option' : 'Alt';
    return 'Shift';
};

const codeLabel = (code: string): string => {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);

    const labels: Record<string, string> = {
        ArrowUp: '方向上键',
        ArrowDown: '方向下键',
        ArrowLeft: '方向左键',
        ArrowRight: '方向右键',
        Backspace: 'Backspace',
        Delete: 'Delete',
        Enter: 'Enter',
        Escape: 'Esc',
        Space: 'Space',
        Tab: 'Tab',
    };
    return labels[code] ?? code;
};

export const getShortcutDisplayParts = (
    binding: ShortcutBinding,
    platform: ShortcutPlatform,
): string[] => {
    const parts = binding.modifiers.map((modifier) => modifierLabel(modifier, platform));
    const keyLabel = binding.key.kind === 'code'
        ? codeLabel(binding.key.code)
        : modifierLabel(binding.key.modifier, platform);

    if (!parts.includes(keyLabel))
        parts.push(keyLabel);
    return parts;
};

export const getEventModifiers = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): Set<ConcreteModifier> => {
    const modifiers = new Set<ConcreteModifier>();
    if (event.ctrlKey) modifiers.add('control');
    if (event.metaKey) modifiers.add('meta');
    if (event.altKey) modifiers.add('alt');
    if (event.shiftKey) modifiers.add('shift');
    return modifiers;
};

export const isEditableShortcutTarget = (target: EventTarget | null): boolean => {
    const element = target instanceof Element ? target : null;
    return Boolean(element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'));
};
