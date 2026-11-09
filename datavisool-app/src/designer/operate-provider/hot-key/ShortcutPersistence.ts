/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import localforage from 'localforage';
import type {
    ShortcutActionId,
    ShortcutBinding,
    ShortcutBindingOverride,
    ShortcutModifier,
    ShortcutPreferencesV1,
} from './ShortcutTypes.ts';

export type ShortcutPersistenceLoadResult =
    | {status: 'ok'; preferences: ShortcutPreferencesV1 | null; warnings: string[]}
    | {status: 'fallback'; reason: string}
    | {status: 'error'; error: unknown};

export interface ShortcutPersistence {
    load(userId: string): Promise<ShortcutPersistenceLoadResult>;
    save(userId: string, preferences: ShortcutPreferencesV1): Promise<void>;
    remove(userId: string): Promise<void>;
}

export const SHORTCUT_STORAGE_OPTIONS = {
    name: 'DataVisoolPreferences',
    storeName: 'shortcut_preferences',
} as const;

export const shortcutStorage = localforage.createInstance(SHORTCUT_STORAGE_OPTIONS);

export const getShortcutPreferenceKey = (userId: string) => `shortcuts:v1:${userId || 'anonymous'}`;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
    value && typeof value === 'object' && !Array.isArray(value),
);

const MODIFIERS = new Set<ShortcutModifier>(['primary', 'control', 'meta', 'alt', 'shift']);

export const isShortcutBinding = (value: unknown): value is ShortcutBinding => {
    if (!isRecord(value) || (value.trigger !== 'press' && value.trigger !== 'hold'))
        return false;
    if (!Array.isArray(value.modifiers) || value.modifiers.some((modifier) => !MODIFIERS.has(modifier as ShortcutModifier)))
        return false;
    if (new Set(value.modifiers).size !== value.modifiers.length)
        return false;

    const key = value.key;
    if (!isRecord(key))
        return false;
    if (key.kind === 'code')
        return typeof key.code === 'string' && key.code.trim().length > 0;
    if (key.kind === 'modifier')
        return MODIFIERS.has(key.modifier as ShortcutModifier);
    return false;
};

export const parseShortcutPreferencesV1 = (raw: unknown): ShortcutPersistenceLoadResult => {
    if (!isRecord(raw))
        return {status: 'fallback', reason: '快捷键配置不是有效对象'};
    if (raw.version !== 1)
        return {status: 'fallback', reason: '快捷键配置版本不受支持'};
    if (!Number.isFinite(raw.updatedAt) || !isRecord(raw.overrides))
        return {status: 'fallback', reason: '快捷键配置结构无效'};

    const warnings: string[] = [];
    const overrides: Partial<Record<ShortcutActionId, ShortcutBindingOverride>> = {};
    for (const [actionId, value] of Object.entries(raw.overrides)) {
        if (value === null || isShortcutBinding(value)) {
            overrides[actionId as ShortcutActionId] = value;
        } else {
            warnings.push(`已忽略无效快捷键覆盖项：${actionId}`);
        }
    }

    return {
        status: 'ok',
        preferences: {
            version: 1,
            updatedAt: raw.updatedAt as number,
            overrides,
        },
        warnings,
    };
};

export class LocalForageShortcutPersistence implements ShortcutPersistence {
    constructor(private readonly storage: LocalForage = shortcutStorage) {
    }

    async load(userId: string): Promise<ShortcutPersistenceLoadResult> {
        try {
            const raw = await this.storage.getItem<unknown>(getShortcutPreferenceKey(userId));
            if (raw === null)
                return {status: 'ok', preferences: null, warnings: []};
            return parseShortcutPreferencesV1(raw);
        } catch (error) {
            return {status: 'error', error};
        }
    }

    async save(userId: string, preferences: ShortcutPreferencesV1): Promise<void> {
        await this.storage.setItem(getShortcutPreferenceKey(userId), preferences);
    }

    async remove(userId: string): Promise<void> {
        await this.storage.removeItem(getShortcutPreferenceKey(userId));
    }
}

export const shortcutPersistence = new LocalForageShortcutPersistence();
