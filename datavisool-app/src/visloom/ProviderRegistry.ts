/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {CapabilityKey, ServiceKey} from './contracts/ServiceKey.ts';

export interface PendingProvider {
    readonly key: CapabilityKey;
    readonly service: unknown;
}

export class ProviderRegistry {
    private readonly providers = new Map<symbol, {pluginId: string; service: unknown}>();

    commit(pluginId: string, pending: ReadonlyMap<symbol, PendingProvider>): void {
        for (const {key} of pending.values()) {
            if (this.providers.has(key.token)) throw new Error(`Service '${key.id}' is already registered.`);
        }
        for (const {key, service} of pending.values()) {
            this.providers.set(key.token, {pluginId, service});
        }
    }

    get<T>(key: ServiceKey<T>): T {
        const provider = this.providers.get(key.token);
        if (!provider) throw new Error(`Service '${key.id}' is not registered.`);
        return provider.service as T;
    }

    removePlugin(pluginId: string): void {
        for (const [token, provider] of this.providers) {
            if (provider.pluginId === pluginId) this.providers.delete(token);
        }
    }
}
