/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useCallback, useEffect, useRef} from 'react';

export interface WorkbenchRequest {
    readonly signal: AbortSignal;
    abort(): void;
    finish(): void;
}

export type BeginWorkbenchRequest = () => WorkbenchRequest | null;

export function useWorkbenchRequests(signal: AbortSignal, canOperate: () => boolean): BeginWorkbenchRequest {
    const pending = useRef(new Set<() => void>());

    useEffect(() => {
        const requests = pending.current;
        return () => {
            for (const abort of requests) abort();
        };
    }, []);

    return useCallback(() => {
        if (!canOperate() || signal.aborted) return null;
        const controller = new AbortController();
        const requests = pending.current;
        const finish = () => {
            signal.removeEventListener('abort', abort);
            requests.delete(abort);
        };
        const abort = () => {
            controller.abort();
            finish();
        };
        requests.add(abort);
        signal.addEventListener('abort', abort, {once: true});
        return {signal: controller.signal, abort, finish};
    }, [canOperate, signal]);
}
