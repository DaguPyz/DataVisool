/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

declare const serviceType: unique symbol;

export type CapabilityKey = Readonly<{
    kind: 'service';
    id: string;
    token: symbol;
}>;

export type ServiceKey<T> = CapabilityKey & {
    readonly [serviceType]?: (value: T) => T;
};

/** Create once in the shared capability contract and import it from both plugins. */
export function createServiceKey<T>(id: string): ServiceKey<T> {
    if (!id.trim()) throw new Error('Service key ID cannot be empty.');
    return Object.freeze({kind: 'service', id, token: Symbol(id)});
}
