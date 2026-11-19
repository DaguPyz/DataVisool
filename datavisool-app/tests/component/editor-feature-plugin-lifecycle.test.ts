/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from 'vitest';
import {ComponentListStore} from '@/plugins/editor-component-library/ComponentListStore.ts';
import {createResourceLibraryLifecycle} from '@/plugins/editor-resource-library/ResourceLibraryLifecycle.ts';
import {ProjectManager} from '@/plugins/editor-project/project/ProjectManager.ts';

describe('feature plugin private lifecycle state', () => {
    it('isolates component library state and repeats cleanup after a canceled pause', () => {
        const first = new ComponentListStore();
        const second = new ComponentListStore();
        const cleanup = vi.fn();

        first.setSearch('temperature');
        expect(second.search).toBe('');

        first.pause();
        first.registerPauseCleanup(cleanup);
        expect(cleanup).toHaveBeenCalledTimes(1);
        first.resume();
        first.pause();
        expect(cleanup).toHaveBeenCalledTimes(2);
        first.resume();
        first.dispose();
        expect(cleanup).toHaveBeenCalledTimes(3);
        expect(second.isAccepting).toBe(true);

        first.dispose();
        expect(cleanup).toHaveBeenCalledTimes(3);
        second.dispose();
    });

    it('waits for started resource tasks and retains cleanup registrations across pause and cancel', async () => {
        const lifecycle = createResourceLibraryLifecycle();
        let finishTask!: () => void;
        const task = lifecycle.trackTask(new Promise<void>(resolve => { finishTask = resolve; }));
        lifecycle.pause();
        let prepared = false;
        const preparation = lifecycle.prepare().then(() => { prepared = true; });
        await Promise.resolve();
        expect(prepared).toBe(false);
        finishTask();
        await Promise.all([task, preparation]);
        expect(prepared).toBe(true);

        const cleanup = vi.fn();
        lifecycle.registerPauseCleanup(cleanup);
        expect(cleanup).toHaveBeenCalledOnce();
        lifecycle.cancel();
        lifecycle.pause();
        expect(cleanup).toHaveBeenCalledTimes(2);
        lifecycle.dispose();
        expect(lifecycle.isAccepting()).toBe(false);
    });

    it('keeps project metadata state private to each project plugin activation', () => {
        const first = new ProjectManager();
        const second = new ProjectManager();
        first.updateProjectConfig({...first.projectConfig, name: 'First project'});
        expect(first.getData().name).toBe('First project');
        expect(second.getData().name).toBe('');
    });
});
