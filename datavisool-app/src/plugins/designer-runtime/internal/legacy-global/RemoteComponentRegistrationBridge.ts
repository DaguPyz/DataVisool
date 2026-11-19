/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

// Legacy remote bundles publish their constructor through one window slot, so their
// script evaluation must be serialized even though each runtime owns a separate registry.
let registrationQueue: Promise<void> = Promise.resolve();
let activeRegistration: object | undefined;

interface BaseUrlOwners {
    readonly owners: Map<object, {readonly value: string}>;
    readonly hadPreviousValue: boolean;
    readonly previousValue?: string;
    appliedValue: string;
}

// Ownership for the existing legacy browser slot must span overlapping activations.
// Project definitions and business state remain in each runtime context.
const baseUrlOwners = new WeakMap<Record<string, string>, Map<string, BaseUrlOwners>>();

export function registerLegacyRemoteBaseUrl(owner: object, key: string, value: string): () => void {
    const globalMap = window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__ ??= {};
    let entries = baseUrlOwners.get(globalMap);
    if (!entries) {
        entries = new Map();
        baseUrlOwners.set(globalMap, entries);
    }
    let state = entries.get(key);
    if (!state) {
        state = {
            owners: new Map(),
            hadPreviousValue: Object.prototype.hasOwnProperty.call(globalMap, key),
            previousValue: globalMap[key],
            appliedValue: value,
        };
        entries.set(key, state);
    }
    const registration = {value};
    state.owners.delete(owner);
    state.owners.set(owner, registration);
    state.appliedValue = value;
    globalMap[key] = value;
    const ownedState = state;
    return () => {
        if (ownedState.owners.get(owner) !== registration) return;
        ownedState.owners.delete(owner);
        const next = [...ownedState.owners.values()].at(-1);
        try {
            if (globalMap[key] === ownedState.appliedValue) {
                if (next) globalMap[key] = next.value;
                else if (ownedState.hadPreviousValue && ownedState.previousValue !== undefined)
                    globalMap[key] = ownedState.previousValue;
                else delete globalMap[key];
            }
        } finally {
            if (next) ownedState.appliedValue = next.value;
            else entries.delete(key);
        }
    };
}

export function serializeRemoteComponentRegistration<T>(operation: (token: object) => Promise<T>): Promise<T> {
    const result = registrationQueue.then(async () => {
        const token = {};
        activeRegistration = token;
        try {
            return await operation(token);
        } finally {
            if (activeRegistration === token) activeRegistration = undefined;
        }
    });
    registrationQueue = result.then(() => undefined, () => undefined);
    return result;
}

/** The old remote bundle protocol writes its constructor into one window slot. */
export function clearRemoteComponentRegistration(token: object): void {
    if (activeRegistration === token) window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = undefined;
}
