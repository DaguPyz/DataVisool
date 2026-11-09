/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from 'vitest';
import {codeBinding, modifierBinding} from '@/designer/operate-provider/hot-key/ShortcutRegistry.ts';
import {ShortcutStore} from '@/designer/operate-provider/hot-key/ShortcutStore.ts';
import type {ShortcutPersistence} from '@/designer/operate-provider/hot-key/ShortcutPersistence.ts';
import {
    SHORTCUT_ACTION_IDS,
    type ShortcutActionId,
    type ShortcutBinding,
    type ShortcutPreferencesV1,
} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';

class MemoryShortcutPersistence implements ShortcutPersistence {
    constructor(private preferences: ShortcutPreferencesV1 | null = null) {}

    async load() {
        return {status: 'ok' as const, preferences: this.preferences, warnings: []};
    }

    async save(_userId: string, preferences: ShortcutPreferencesV1): Promise<void> {
        this.preferences = preferences;
    }

    async remove(): Promise<void> {
        this.preferences = null;
    }
}

const preferences = (
    overrides: ShortcutPreferencesV1['overrides'],
): ShortcutPreferencesV1 => ({version: 1, updatedAt: 1, overrides});

const legacyToolCases: Array<{
    keyCode: string;
    toolActionId: ShortcutActionId;
}> = [
    {keyCode: 'Space', toolActionId: SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND},
    {keyCode: 'KeyH', toolActionId: SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND},
    {keyCode: 'KeyV', toolActionId: SHORTCUT_ACTION_IDS.CANVAS_TOOL_SELECT},
];

const legacyBinding = (keyCode: string): ShortcutBinding => codeBinding(keyCode, [], 'hold');

describe('workspace shortcut compatibility', () => {
    test.each(legacyToolCases)(
        'keeps persisted box-selection hold on $keyCode and yields the matching new tool default',
        async ({keyCode, toolActionId}) => {
            const persisted = preferences({
                [SHORTCUT_ACTION_IDS.BOX_SELECTION_START]: legacyBinding(keyCode),
            });
            const store = new ShortcutStore({
                persistence: new MemoryShortcutPersistence(persisted),
                platform: 'windows',
            });

            await store.initialize('user-a');

            expect(store.getBinding(SHORTCUT_ACTION_IDS.BOX_SELECTION_START)).toEqual(legacyBinding(keyCode));
            expect(store.getBinding(toolActionId)).toBeNull();
        },
    );

    test.each(legacyToolCases)(
        'allows runtime box-selection hold on $keyCode and yields the matching new tool default',
        async ({keyCode, toolActionId}) => {
            const store = new ShortcutStore({
                persistence: new MemoryShortcutPersistence(),
                platform: 'windows',
                saveDelayMs: 60_000,
            });

            expect(store.setBinding(SHORTCUT_ACTION_IDS.BOX_SELECTION_START, legacyBinding(keyCode))).toEqual({ok: true});
            expect(store.getBinding(SHORTCUT_ACTION_IDS.BOX_SELECTION_START)).toEqual(legacyBinding(keyCode));
            expect(store.getBinding(toolActionId)).toBeNull();
            await store.flushPendingSave();
        },
    );

    test('rejects a new tool custom binding that conflicts with an old custom box-selection binding', async () => {
        const store = new ShortcutStore({
            persistence: new MemoryShortcutPersistence(),
            platform: 'windows',
            saveDelayMs: 60_000,
        });
        const oldBinding = legacyBinding('KeyH');

        expect(store.setBinding(SHORTCUT_ACTION_IDS.BOX_SELECTION_START, oldBinding)).toEqual({ok: true});
        expect(store.setBinding(SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND, codeBinding('KeyH'))).toMatchObject({
            ok: false,
            reason: 'conflict',
        });
        expect(store.getBinding(SHORTCUT_ACTION_IDS.BOX_SELECTION_START)).toEqual(oldBinding);
        expect(store.getBinding(SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND)).toBeNull();
        await store.flushPendingSave();
    });

    test('matches the default Space hold exactly and does not treat Ctrl+Space as plain Space', () => {
        const store = new ShortcutStore({persistence: new MemoryShortcutPersistence(), platform: 'windows'});
        const plainSpace = new KeyboardEvent('keydown', {code: 'Space'});
        const controlSpace = new KeyboardEvent('keydown', {code: 'Space', ctrlKey: true});

        expect(store.isActiveWithExactModifiers(SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND, plainSpace)).toBe(true);
        expect(store.isActiveWithExactModifiers(SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND, controlSpace)).toBe(false);
    });

    test('matches a custom Ctrl+Space hold exactly', async () => {
        const store = new ShortcutStore({
            persistence: new MemoryShortcutPersistence(),
            platform: 'windows',
            saveDelayMs: 60_000,
        });
        const customBinding = codeBinding('Space', ['control'], 'hold');

        expect(store.setBinding(SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND, customBinding)).toEqual({ok: true});
        expect(store.isActiveWithExactModifiers(
            SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND,
            new KeyboardEvent('keydown', {code: 'Space', ctrlKey: true}),
        )).toBe(true);
        expect(store.isActiveWithExactModifiers(
            SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND,
            new KeyboardEvent('keydown', {code: 'Space'}),
        )).toBe(false);
        await store.flushPendingSave();
    });

    test('matches a custom single modifier hold', async () => {
        const store = new ShortcutStore({
            persistence: new MemoryShortcutPersistence(),
            platform: 'windows',
            saveDelayMs: 60_000,
        });

        expect(store.setBinding(SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND, modifierBinding('meta'))).toEqual({ok: true});
        expect(store.isActiveWithExactModifiers(
            SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND,
            new KeyboardEvent('keydown', {code: 'MetaLeft', metaKey: true}),
        )).toBe(true);
        await store.flushPendingSave();
    });
});
