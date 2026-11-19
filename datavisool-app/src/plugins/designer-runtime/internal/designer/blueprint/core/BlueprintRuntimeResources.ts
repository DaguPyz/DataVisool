/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';

type Cleanup = () => void;
const cleanupsByManager = new WeakMap<DesignerManager, Set<Cleanup>>();

/** Register runtime-only resources without making the model manager import UI code. */
export function registerBlueprintRuntimeCleanup(manager: DesignerManager, cleanup: Cleanup): Cleanup {
    let cleanups = cleanupsByManager.get(manager);
    if (!cleanups) {
        cleanups = new Set();
        cleanupsByManager.set(manager, cleanups);
    }
    cleanups.add(cleanup);
    let registered = true;
    return () => {
        if (!registered) return;
        registered = false;
        const current = cleanupsByManager.get(manager);
        current?.delete(cleanup);
        if (current?.size === 0) cleanupsByManager.delete(manager);
    };
}

/** Run every manager-owned cleanup even if one resource fails to release. */
export function disposeBlueprintRuntimeResources(manager: DesignerManager): void {
    const cleanups = cleanupsByManager.get(manager);
    if (!cleanups) return;
    cleanupsByManager.delete(manager);
    const errors: unknown[] = [];
    [...cleanups].reverse().forEach(cleanup => {
        try { cleanup(); } catch (error) { errors.push(error); }
    });
    if (errors.length) throw new AggregateError(errors, 'Failed to dispose blueprint runtime resources.');
}
