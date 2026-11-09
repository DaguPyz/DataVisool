/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {DATA_CONFIG_CONTROLLER_PROXY_TARGET} from '@/comps/common-component/data-config/DataConfigControllerGuard';
import type AbstractDesignerController from '@/framework/core/AbstractDesignerController';

/** Keep the controller as the receiver: SDK consumers may use private fields. */
export function createConfigControllerProxy<T extends AbstractDesignerController>(
    controller: T,
    onUpdate: (target: T, args: any[]) => unknown,
): T {
    const boundMethods = new WeakMap<Function, Function>();
    const update = (...args: any[]) => onUpdate(controller, args);
    return new Proxy(controller, {
        get(target, prop) {
            if (prop === DATA_CONFIG_CONTROLLER_PROXY_TARGET) return target;
            const value = Reflect.get(target, prop, target);
            if (prop === 'update' && typeof value === 'function') return update;
            if (typeof value !== 'function') return value;
            const existing = boundMethods.get(value);
            if (existing) return existing;
            const bound: Function = value.bind(target);
            boundMethods.set(value, bound);
            return bound;
        },
        set(target, prop, value) {
            return Reflect.set(target, prop, value, target);
        },
    });
}
