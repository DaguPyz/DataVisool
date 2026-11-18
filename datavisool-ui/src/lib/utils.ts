/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
export type ClassValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | ClassValue[]
    | Record<string, unknown>;

export function cn(...inputs: ClassValue[]) {
    const classes: string[] = [];

    const append = (input: ClassValue) => {
        if (!input)
            return;
        if (typeof input === 'string' || typeof input === 'number') {
            classes.push(String(input));
            return;
        }
        if (Array.isArray(input)) {
            input.forEach(append);
            return;
        }
        if (typeof input === 'object') {
            Object.entries(input).forEach(([className, enabled]) => {
                if (enabled)
                    classes.push(className);
            });
        }
    };

    inputs.forEach(append);
    return classes.join(' ');
}
