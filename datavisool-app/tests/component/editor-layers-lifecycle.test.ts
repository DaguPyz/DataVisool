/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {afterEach, describe, expect, it, vi} from 'vitest';
import type {EditorCanvasService, EditorLayerDomain} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {EditorLayersState} from '@/plugins/editor-layers/EditorLayersState.ts';
import {createLayerConsumer} from '@/plugins/editor-layers/LayerConsumer.ts';

function fixture() {
    const state = new EditorLayersState();
    state.setScene(7);
    const rename = vi.fn(() => true);
    const select = vi.fn();
    const domain: EditorLayerDomain = {
        sceneVersion: 7, isActive: () => true,
        readTree: () => [], readLayer: () => undefined, readCanvasSize: () => ({width: 800, height: 600}),
        rename, setHidden: vi.fn(() => true), setLocked: vi.fn(() => true), reorder: vi.fn(() => true),
    };
    const canvas = {
        readSelection: () => ({ids: ['one'], source: 'layer-list'}),
        select, insertLayer: vi.fn(), focus: vi.fn(), closeContextMenu: vi.fn(), isSceneActive: () => true,
        prepareLayerDomain: vi.fn(async () => domain),
    } as unknown as EditorCanvasService;
    return {state, domain, canvas, rename, select, consumer: createLayerConsumer(canvas, state)};
}

afterEach(() => vi.useRealTimers());

describe('editor layers stop preparation', () => {
    it('keeps mounted reads and view state while refusing writes, then restores the same handles on cancel', async () => {
        const {state, consumer, rename, select} = fixture();
        const domain = await consumer.prepareLayerDomain();
        state.setSearchOpen(true);
        state.setSearchKeyword('草稿名称');
        state.toggleGroup('group');
        state.pause();

        expect(domain.isActive()).toBe(true);
        expect(domain.readCanvasSize()).toEqual({width: 800, height: 600});
        expect(domain.rename('one', 'stale')).toBe(false);
        consumer.canvas.select(['two']);
        state.setSearchKeyword('late');
        state.toggleGroup('group');
        expect(rename).not.toHaveBeenCalled();
        expect(select).not.toHaveBeenCalled();
        expect(state.searchKeyword).toBe('草稿名称');
        expect(state.isGroupExpanded('group')).toBe(true);
        await expect(consumer.prepareLayerDomain()).rejects.toMatchObject({name: 'AbortError'});

        state.resume();
        expect(state.searchOpen).toBe(true);
        expect(domain.rename('one', 'resumed')).toBe(true);
        consumer.canvas.select(['two']);
        expect(rename).toHaveBeenCalledWith('one', 'resumed');
        expect(select).toHaveBeenCalledWith(['two']);
        consumer.dispose(); state.dispose();
    });

    it('invalidates old handles and pending preparations without disabling a new activation', async () => {
        const first = fixture();
        const oldDomain = await first.consumer.prepareLayerDomain();
        let resolve!: (domain: EditorLayerDomain) => void;
        vi.mocked(first.canvas.prepareLayerDomain).mockImplementation(() => new Promise(done => { resolve = done; }));
        const pending = first.consumer.prepareLayerDomain();
        first.consumer.dispose();
        first.state.dispose();
        const next = fixture();
        const currentDomain = await next.consumer.prepareLayerDomain();
        resolve(first.domain);
        await expect(pending).rejects.toMatchObject({name: 'AbortError'});
        expect(oldDomain.isActive()).toBe(false);
        expect(oldDomain.rename('one', 'late')).toBe(false);
        first.consumer.canvas.select(['late']);
        expect(first.rename).not.toHaveBeenCalled();
        expect(first.select).not.toHaveBeenCalled();
        expect(currentDomain.rename('one', 'current')).toBe(true);
        expect(next.rename).toHaveBeenCalledOnce();
        next.consumer.dispose(); next.state.dispose();
    });

    it('cancels delayed work and every active interaction even when one cleanup fails', () => {
        vi.useFakeTimers();
        const {state, consumer} = fixture();
        const delayed = vi.fn();
        const released: string[] = [];
        state.scheduleTimeout(delayed, 20);
        state.scheduleFrame(delayed);
        state.ownInteraction(() => released.push('first'));
        const unregisterFailure = state.ownInteraction(() => { released.push('failed'); throw new Error('failed'); });
        state.ownInteraction(() => released.push('last'));
        expect(() => state.pause()).toThrow(AggregateError);
        expect(released).toEqual(['last', 'failed', 'first']);
        expect(state.isAccepting()).toBe(false);
        state.scheduleTimeout(delayed, 0);
        vi.runAllTimers();
        expect(delayed).not.toHaveBeenCalled();
        unregisterFailure();
        state.resume();
        state.scheduleTimeout(delayed, 1);
        vi.advanceTimersByTime(1);
        expect(delayed).toHaveBeenCalledOnce();
        consumer.dispose(); state.dispose();
        expect(state.isAccepting()).toBe(false);
    });
});
