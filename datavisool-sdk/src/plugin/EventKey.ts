/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export type EventKey<T> = Readonly<{
    kind: 'event';
    id: string;
    token: symbol;
    __eventType?: (payload: T) => T;
}>;

export type EventListener<T> = (payload: T) => void | Promise<void>;

/** Publishers and subscribers can use separate copies of the same event contract. */
export function createEventKey<T>(id: string): EventKey<T> {
    if (!id.trim()) throw new Error('Event key ID cannot be empty.');
    return Object.freeze({kind: 'event', id, token: Symbol.for('datavisool:event:' + id)});
}
