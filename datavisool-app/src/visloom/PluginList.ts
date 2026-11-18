/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {Plugin} from './contracts/Plugin.ts';

const reservedServiceNames = new Set([
    'provide', 'get', 'on', 'emit', 'onDispose', 'onStop', 'then',
    ...Object.getOwnPropertyNames(Object.prototype),
]);

export interface PluginListEntry {
    readonly id: string;
    readonly requires: ReadonlySet<string>;
    readonly provides: ReadonlySet<string>;
    readonly activate: Plugin['activate'];
    readonly deactivate?: Plugin['deactivate'];
}

/** Validate the entire list and keep the original order among plugins that are ready. */
export function createPluginList(plugins: readonly Plugin[]): readonly PluginListEntry[] {
    const entries = plugins.map(readPlugin);
    const ids = new Set<string>();
    const providers = new Map<string, string>();
    for (const entry of entries) {
        if (ids.has(entry.id)) throw new Error(`Duplicate plugin ID '${entry.id}'.`);
        ids.add(entry.id);
        for (const name of entry.provides) {
            const provider = providers.get(name);
            if (provider !== undefined) {
                throw new Error(`Service '${name}' has multiple providers: '${provider}' and '${entry.id}'.`);
            }
            providers.set(name, entry.id);
        }
    }

    const dependencies = new Map<string, Set<string>>();
    const dependents = new Map<string, Set<string>>();
    for (const entry of entries) {
        const requiredPlugins = new Set<string>();
        for (const name of entry.requires) {
            const provider = providers.get(name);
            if (provider === undefined) {
                throw new Error(`Plugin '${entry.id}' requires service '${name}', which has no provider.`);
            }
            requiredPlugins.add(provider);
            const consumers = dependents.get(provider) ?? new Set<string>();
            consumers.add(entry.id);
            dependents.set(provider, consumers);
        }
        dependencies.set(entry.id, requiredPlugins);
    }

    const remaining = new Set(ids);
    const ordered: PluginListEntry[] = [];
    while (remaining.size) {
        const next = entries.find(entry => remaining.has(entry.id) && dependencies.get(entry.id)!.size === 0);
        if (!next) throw new Error(`Plugin dependency cycle: ${describeCycle(remaining, dependencies)}.`);

        ordered.push(next);
        remaining.delete(next.id);
        for (const dependent of dependents.get(next.id) ?? []) {
            dependencies.get(dependent)!.delete(next.id);
        }
    }
    return ordered;
}

function readPlugin(plugin: Plugin): PluginListEntry {
    const {id, requires, provides, activate, deactivate} = plugin;
    if (typeof id !== 'string' || !id.trim()) throw new Error('Plugin ID cannot be empty.');
    if (typeof activate !== 'function') throw new TypeError(`Plugin '${id}' must define activate().`);
    if (deactivate !== undefined && typeof deactivate !== 'function') {
        throw new TypeError(`Plugin '${id}' has an invalid deactivate() callback.`);
    }
    return {
        id,
        requires: readDeclaration(id, 'requires', requires),
        provides: readDeclaration(id, 'provides', provides),
        activate: activate.bind(plugin),
        deactivate: deactivate?.bind(plugin),
    };
}

function readDeclaration(
    pluginId: string,
    field: 'requires' | 'provides',
    names: readonly string[],
): ReadonlySet<string> {
    if (!Array.isArray(names)) {
        throw new TypeError(`Plugin '${pluginId}' must declare '${field}' as an array.`);
    }

    const declaration = new Set<string>();
    for (const name of names) {
        if (typeof name !== 'string' || !name.trim()) {
            throw new TypeError(`Plugin '${pluginId}' declares an invalid service name in '${field}'.`);
        }
        if (reservedServiceNames.has(name)) {
            throw new Error(`Plugin '${pluginId}' declares reserved service name '${name}' in '${field}'.`);
        }
        if (declaration.has(name)) {
            throw new Error(`Plugin '${pluginId}' declares service '${name}' more than once in '${field}'.`);
        }
        declaration.add(name);
    }
    return declaration;
}

function describeCycle(remaining: ReadonlySet<string>, dependencies: ReadonlyMap<string, ReadonlySet<string>>): string {
    // At this point every remaining plugin still has at least one unresolved dependency.
    let current = remaining.values().next().value!;
    const path: string[] = [];
    const positions = new Map<string, number>();
    while (!positions.has(current)) {
        positions.set(current, path.length);
        path.push(current);
        current = dependencies.get(current)!.values().next().value!;
    }
    return [...path.slice(positions.get(current)), current].join(' -> ');
}
