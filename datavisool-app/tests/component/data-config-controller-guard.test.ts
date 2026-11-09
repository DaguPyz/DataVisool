/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from 'vitest'
import {
    DATA_CONFIG_CONTROLLER_PROXY_TARGET,
    isDataConfigControllerCurrent
} from '@/comps/common-component/data-config/DataConfigControllerGuard.ts'

const createController = (id: string | null) => ({
    config: id ? {base: {id}} : null,
    getConfig() {
        return this.config;
    },
})

const createProxyController = (rawController: ReturnType<typeof createController>) => {
    return new Proxy(rawController, {
        get(target, prop) {
            if (prop === DATA_CONFIG_CONTROLLER_PROXY_TARGET)
                return target;
            return target[prop as keyof typeof target];
        },
    })
}

describe('DataConfig controller guard', () => {
    it('accepts the active config proxy when the raw controller is registered in the current manager', () => {
        const rawController = createController('text-a');
        const proxyController = createProxyController(rawController);

        expect(isDataConfigControllerCurrent(proxyController as never, 'text-a', {
            'text-a': rawController as never,
        })).toBe(true);
    });

    it('accepts the active raw controller when it is registered in the current manager', () => {
        const rawController = createController('text-a');

        expect(isDataConfigControllerCurrent(rawController as never, 'text-a', {
            'text-a': rawController as never,
        })).toBe(true);
    });

    it('rejects a proxy when the current manager no longer contains the target controller id', () => {
        const rawController = createController('text-a');
        const proxyController = createProxyController(rawController);

        expect(isDataConfigControllerCurrent(proxyController as never, 'text-a', {
            'other': createController('other') as never,
        })).toBe(false);
    });

    it('rejects stale saves when the same id belongs to a new controller instance', () => {
        const staleController = createController('text-a');
        const proxyController = createProxyController(staleController);
        const currentController = createController('text-a');

        expect(isDataConfigControllerCurrent(proxyController as never, 'text-a', {
            'text-a': currentController as never,
        })).toBe(false);
    });

    it('rejects stale saves when the proxy config id has changed', () => {
        const rawController = createController('text-a');
        const proxyController = createProxyController(rawController);

        expect(isDataConfigControllerCurrent(proxyController as never, 'old-text', {
            'old-text': createController('old-text') as never,
        })).toBe(false);
    });
})
