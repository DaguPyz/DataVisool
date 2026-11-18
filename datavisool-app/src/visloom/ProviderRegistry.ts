/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ServiceType} from '@datavisool/sdk/plugin';

export class ProviderRegistry {
    private readonly providers = new Map<string, {pluginId: string; service: unknown}>();

    commit(pluginId: string, pending: ReadonlyMap<string, unknown>): void {
        for (const name of pending.keys()) {
            if (this.providers.has(name)) throw new Error(`Service '${name}' is already registered.`);
        }
        for (const [name, service] of pending) {
            this.providers.set(name, {pluginId, service});
        }
    }

    get<Name extends string>(name: Name): ServiceType<Name> {
        const provider = this.providers.get(name);
        if (!provider) throw new Error(`Service '${name}' is not registered.`);
        return provider.service as ServiceType<Name>;
    }

    removePlugin(pluginId: string): void {
        for (const [name, provider] of this.providers) {
            if (provider.pluginId === pluginId) this.providers.delete(name);
        }
    }
}
