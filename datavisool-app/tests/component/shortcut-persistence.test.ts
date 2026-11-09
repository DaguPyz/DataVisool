/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from 'vitest';
import {
    getShortcutPreferenceKey,
    LocalForageShortcutPersistence,
    parseShortcutPreferencesV1,
    SHORTCUT_STORAGE_OPTIONS,
} from '@/designer/operate-provider/hot-key/ShortcutPersistence.ts';
import {codeBinding} from '@/designer/operate-provider/hot-key/ShortcutRegistry.ts';
import {SHORTCUT_ACTION_IDS, type ShortcutPreferencesV1} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';

describe('ShortcutPersistence', () => {
    it('使用独立数据库和按用户隔离的键', () => {
        expect(SHORTCUT_STORAGE_OPTIONS).toEqual({
            name: 'DataVisoolPreferences',
            storeName: 'shortcut_preferences',
        });
        expect(getShortcutPreferenceKey('user-a')).toBe('shortcuts:v1:user-a');
        expect(getShortcutPreferenceKey('')).toBe('shortcuts:v1:anonymous');
    });

    it('逐项忽略损坏覆盖并保留null禁用', () => {
        const result = parseShortcutPreferencesV1({
            version: 1,
            updatedAt: 123,
            overrides: {
                [SHORTCUT_ACTION_IDS.COPY]: codeBinding('KeyQ', ['primary']),
                [SHORTCUT_ACTION_IDS.DELETE]: null,
                broken: {key: {kind: 'code', code: ''}, modifiers: [], trigger: 'press'},
            },
        });
        expect(result.status).toBe('ok');
        if (result.status !== 'ok' || !result.preferences) return;
        expect(result.preferences.overrides[SHORTCUT_ACTION_IDS.COPY]).toEqual(codeBinding('KeyQ', ['primary']));
        expect(result.preferences.overrides[SHORTCUT_ACTION_IDS.DELETE]).toBeNull();
        expect(result.preferences.overrides).not.toHaveProperty('broken');
        expect(result.warnings).toHaveLength(1);
    });

    it('未知版本和无效结构安全回退', () => {
        expect(parseShortcutPreferencesV1({version: 2, updatedAt: 0, overrides: {}}).status).toBe('fallback');
        expect(parseShortcutPreferencesV1({version: 1, updatedAt: 0, overrides: []}).status).toBe('fallback');
        expect(parseShortcutPreferencesV1(null).status).toBe('fallback');
    });

    it('通过独立实例读写并删除当前用户配置', async () => {
        const data = new Map<string, unknown>();
        const storage = {
            getItem: vi.fn(async (key: string) => data.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: unknown) => {
                data.set(key, value);
                return value;
            }),
            removeItem: vi.fn(async (key: string) => {
                data.delete(key);
            }),
        } as unknown as LocalForage;
        const persistence = new LocalForageShortcutPersistence(storage);
        const preferences: ShortcutPreferencesV1 = {
            version: 1,
            updatedAt: 123,
            overrides: {[SHORTCUT_ACTION_IDS.COPY]: codeBinding('KeyQ', ['primary'])},
        };

        await persistence.save('user-a', preferences);
        expect((await persistence.load('user-a')).status).toBe('ok');
        expect((await persistence.load('user-b')).status).toBe('ok');
        await persistence.remove('user-a');
        expect(data.has(getShortcutPreferenceKey('user-a'))).toBe(false);
    });
});
