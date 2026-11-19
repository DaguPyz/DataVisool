/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {StrictMode} from 'react';
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {EditorBlueprintSession} from '@/plugins/editor-blueprint/session/EditorBlueprintSession.ts';
import {createBlueprintSessionFixture} from './support/blueprintSessionFixture.ts';

vi.mock('@/plugins/editor-blueprint/BluePrintDialog.tsx', async () => {
    const {useEditorBlueprintSession} = await import('@/plugins/editor-blueprint/session/EditorBlueprintSessionContext.tsx');
    return {default: () => <div>{useEditorBlueprintSession().isActive() ? 'active-session' : 'stopped-session'}</div>};
});

import {EditorBlueprintOverlay} from '@/plugins/editor-blueprint/session/EditorBlueprintOverlay.tsx';

describe('blueprint editing session ownership', () => {
    let fixture: ReturnType<typeof createBlueprintSessionFixture> | undefined;
    afterEach(() => { cleanup(); fixture?.dispose(); fixture = undefined; });

    it('creates a live replacement after StrictMode disposes the first effect mount', async () => {
        fixture = createBlueprintSessionFixture();
        const created: EditorBlueprintSession[] = [];
        const view = render(<StrictMode><EditorBlueprintOverlay
            project={fixture.project as never} canvas={fixture.canvas as never} registry={fixture.registry}
            onClose={() => undefined} onSession={next => { if (next) created.push(next); }}/></StrictMode>);
        await screen.findByText('active-session');
        expect(new Set(created).size).toBe(2);
        expect(created[0].isActive()).toBe(false);
        expect(created[1].isActive()).toBe(true);
        view.unmount();
        expect(created.every(session => !session.isActive())).toBe(true);
    });

    it('reverts a graph commit when its shared history registration is rejected', () => {
        fixture = createBlueprintSessionFixture();
        fixture.canvas.recordChange = () => false;
        const before = fixture.scene.blueprints.read()!.pages;
        expect(fixture.session.addNewPage()).toBe(false);
        expect(fixture.scene.blueprints.read()!.pages).toEqual(before);
        expect(fixture.session.bpPageMangers).toEqual(before);
        expect(fixture.history.undo(() => undefined)).toBe(false);
    });

    it('blocks edits while paused and retains its panel state after cancellation', () => {
        fixture = createBlueprintSessionFixture();
        fixture.session.workspaceUIStore.openRight();
        fixture.session.pause();
        expect(fixture.session.addNewPage()).toBe(false);
        expect(fixture.scene.blueprints.read()!.pages).toHaveLength(1);
        fixture.session.resume();
        expect(fixture.session.workspaceUIStore.rightOpen).toBe(true);
        expect(fixture.session.addNewPage()).toBe(true);
        expect(fixture.scene.blueprints.read()!.pages).toHaveLength(2);
    });

    it('releases remaining resources after one cleanup throws and does not run them twice', () => {
        fixture = createBlueprintSessionFixture();
        const first = vi.fn();
        const failed = vi.fn(() => { throw new Error('cleanup failed'); });
        const last = vi.fn();
        fixture.session.ownViewResource(first);
        fixture.session.ownViewResource(failed);
        fixture.session.ownViewResource(last);
        expect(() => fixture!.session.dispose()).toThrow(AggregateError);
        expect(first).toHaveBeenCalledTimes(1);
        expect(failed).toHaveBeenCalledTimes(1);
        expect(last).toHaveBeenCalledTimes(1);
        act(() => fixture!.session.dispose());
        expect(first).toHaveBeenCalledTimes(1);
        expect(last).toHaveBeenCalledTimes(1);
    });
});
