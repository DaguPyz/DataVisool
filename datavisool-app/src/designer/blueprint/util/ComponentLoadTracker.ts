/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type DesignerManager from '@/designer/manager/DesignerManager';
import type AbstractDesignerController from '@/framework/core/AbstractDesignerController';

type Controller = AbstractDesignerController;
type Session = {globalDispatched: boolean; notified: WeakSet<Controller>};

const pending = new WeakSet<Controller>();
const sessions = new WeakMap<DesignerManager, Session>();
const readinessListeners = new WeakMap<DesignerManager, Set<(controller: Controller) => void>>();

export function markComponentPending(controller: Controller): void {
    pending.add(controller);
}

export function isComponentReady(controller: Controller): boolean {
    return !pending.has(controller);
}

export function beginComponentLoadEvents(manager: DesignerManager): void {
    sessions.set(manager, {globalDispatched: false, notified: new WeakSet()});
}

export function dispatchComponentLoaded(manager: DesignerManager, controller: Controller): void {
    const session = sessions.get(manager);
    const componentId = controller.config?.base?.id;
    const componentType = controller.config?.base?.type;
    // These components emit loaded at their own readiness point.
    if (componentType === 'group' || componentType === 'LoopContainer') return;
    // An active MapLibre map emits loaded when its map resources are ready. The
    // configuration placeholder has no map, so it still uses the global event.
    if (componentType === 'MapLibreGis' && (controller as Controller & {hasActiveMap?: () => boolean}).hasActiveMap?.()) return;
    if (!session || !isComponentReady(controller) || !componentId || session.notified.has(controller)) return;
    session.notified.add(controller);
    manager.bpExecutor?.triggerComponentEvent(componentId, 'loaded', controller.config, controller.index);
}

export function dispatchGlobalComponentLoads(manager: DesignerManager): void {
    const session = sessions.get(manager);
    if (!session) return;
    session.globalDispatched = true;
    new Set(Object.values(manager.layerManager.controllers ?? {})).forEach(controller => dispatchComponentLoaded(manager, controller));
}

export function markComponentReady(manager: DesignerManager, controller: Controller): void {
    pending.delete(controller);
    const session = sessions.get(manager);
    if (session?.globalDispatched && Object.values(manager.layerManager.controllers ?? {}).includes(controller)) {
        dispatchComponentLoaded(manager, controller);
    }
    readinessListeners.get(manager)?.forEach(listener => listener(controller));
}

export function onComponentReady(manager: DesignerManager, listener: (controller: Controller) => void): () => void {
    let listeners = readinessListeners.get(manager);
    if (!listeners) {
        listeners = new Set();
        readinessListeners.set(manager, listeners);
    }
    listeners.add(listener);
    return () => {
        listeners!.delete(listener);
        if (listeners!.size === 0) readinessListeners.delete(manager);
    };
}
