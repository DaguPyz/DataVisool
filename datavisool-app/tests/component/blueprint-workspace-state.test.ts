/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from 'vitest';
import {BPWorkspaceUIStore} from '@/designer/blueprint/workspace/BPWorkspaceUIStore.ts';

describe('BPWorkspaceUIStore', () => {
    it('starts with the node library open and configuration panel closed', () => {
        const store = new BPWorkspaceUIStore();

        expect(store.leftOpen).toBe(true);
        expect(store.rightOpen).toBe(false);
        expect(store.rightWidth).toBe(304);
        expect(store.activeNarrowPanel).toBe('left');
    });

    it('opens the last requested panel on narrow screens while retaining both wide-screen states', () => {
        const store = new BPWorkspaceUIStore();

        store.openRight();
        expect(store.isLeftLibraryVisible(true)).toBe(false);
        expect(store.isLeftLibraryVisible(false)).toBe(true);

        store.toggleLeft(store.isLeftLibraryVisible(true));
        expect(store.isLeftLibraryVisible(true)).toBe(true);
        expect(store.activeNarrowPanel).toBe('left');
        expect(store.rightOpen).toBe(true);
    });

    it('clamps panel width and ignores non-finite measurements', () => {
        const store = new BPWorkspaceUIStore();

        store.setRightWidth(100);
        expect(store.rightWidth).toBe(260);
        store.setRightWidth(720);
        expect(store.rightWidth).toBe(560);
        store.setRightWidth(Number.NaN);
        store.setRightWidth(Number.POSITIVE_INFINITY);
        expect(store.rightWidth).toBe(560);
    });
});
