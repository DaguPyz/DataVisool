/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {useCallback, useRef, useState} from 'react';

export function useControllable<T>(value: T | undefined, defaultValue: T | undefined) {
    const controlled = value !== undefined && defaultValue === undefined;
    const [stateValue, setStateValue] = useState<T | undefined>(controlled ? value : defaultValue);
    const finalValue = controlled ? value : stateValue;

    return [finalValue, setStateValue, controlled] as const;
}

export function useDebouncedCallback<T extends (...args: any[]) => void>(callback: T, delay: number) {
    const timerRef = useRef<number>();

    return useCallback((...args: Parameters<T>) => {
        if (timerRef.current)
            window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => callback(...args), delay);
    }, [callback, delay]);
}
