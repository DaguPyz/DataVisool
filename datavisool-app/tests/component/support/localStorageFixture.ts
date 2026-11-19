/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {afterEach, beforeEach} from 'vitest';

/** Explicit browser storage for journal tests, independent of Node's optional Web Storage implementation. */
export function useMemoryLocalStorage() {
    let original: PropertyDescriptor | undefined;
    beforeEach(() => {
        original = Object.getOwnPropertyDescriptor(window, 'localStorage');
        const values = new Map<string, string>();
        const storage: Storage = {
            get length() { return values.size; },
            clear: () => values.clear(),
            getItem: key => values.get(String(key)) ?? null,
            key: index => [...values.keys()][index] ?? null,
            removeItem: key => { values.delete(String(key)); },
            setItem: (key, value) => { values.set(String(key), String(value)); },
        };
        Object.defineProperty(window, 'localStorage', {configurable: true, value: storage});
    });
    afterEach(() => {
        if (original) Object.defineProperty(window, 'localStorage', original);
        else Reflect.deleteProperty(window, 'localStorage');
    });
}
