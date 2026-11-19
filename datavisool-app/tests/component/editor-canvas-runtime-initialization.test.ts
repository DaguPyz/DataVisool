/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {describe, expect, it, vi} from 'vitest';
import type {PluginContext} from '@datavisool/sdk/plugin';
import {createEditorCanvasRuntime} from '@/plugins/editor-canvas/editorCanvasRuntime.tsx';
import {createCanvasShortcutInput} from '@/plugins/editor-canvas/shortcutInput.ts';

describe('editor canvas runtime initialization cleanup', () => {
    it('withdraws partial event and toolbar registrations after failure so initialization can retry', () => {
        const activeToolbars = new Set<number>();
        const activeListeners = new Set<number>();
        let registrationId = 0;
        let listenerCalls = 0;
        let failAtListenerCall = 2;
        let toolbarCalls = 0;
        let failAtToolbarCall = -1;
        const registerToolbarItem = vi.fn(() => {
            toolbarCalls += 1;
            if (toolbarCalls === failAtToolbarCall) throw new Error('toolbar registration failed');
            const id = ++registrationId;
            activeToolbars.add(id);
            return vi.fn(() => { activeToolbars.delete(id); });
        });
        const context = {
            editorShell: {registerToolbarItem},
            designerRuntime: {},
            designerCatalog: {},
            editorCommands: {},
            on: vi.fn(() => {
                listenerCalls += 1;
                if (listenerCalls === failAtListenerCall) throw new Error('event registration failed');
                const id = ++registrationId;
                activeListeners.add(id);
                return vi.fn(() => { activeListeners.delete(id); });
            }),
            emit: vi.fn().mockResolvedValue(undefined),
        } as unknown as PluginContext;
        const shortcutInput = createCanvasShortcutInput();
        const source = {
            isActive: () => true,
            isActiveWithExactModifiers: () => true,
            subscribePressedState: () => vi.fn(),
        };
        const unregisterInput = shortcutInput.register(source);

        expect(() => createEditorCanvasRuntime(context, shortcutInput)).toThrow('event registration failed');
        expect(activeToolbars.size).toBe(0);
        expect(activeListeners.size).toBe(0);
        expect(shortcutInput.query.isActive('designer.history.undo', {} as KeyboardEvent)).toBe(true);

        failAtListenerCall = -1;
        failAtToolbarCall = 3;
        expect(() => createEditorCanvasRuntime(context, shortcutInput)).toThrow('toolbar registration failed');
        expect(activeToolbars.size).toBe(0);
        expect(activeListeners.size).toBe(0);
        expect(shortcutInput.query.isActive('designer.history.undo', {} as KeyboardEvent)).toBe(true);

        failAtToolbarCall = -1;
        const runtime = createEditorCanvasRuntime(context, shortcutInput);
        expect(registerToolbarItem).toHaveBeenCalledTimes(7);
        expect(activeToolbars.size).toBe(4);
        expect(activeListeners.size).toBe(2);

        runtime.dispose();
        expect(activeToolbars.size).toBe(0);
        expect(activeListeners.size).toBe(0);
        unregisterInput();
        shortcutInput.dispose();
    });
});
