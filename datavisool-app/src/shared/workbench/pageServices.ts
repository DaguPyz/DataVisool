/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useSyncExternalStore} from 'react';
import type {PluginContext} from '@datavisool/sdk/plugin';
import {createSessionRequestOptions} from '@/api/sessionRequestOptions.ts';
import {createI18nBinding} from '@/i18n/i18nBinding.ts';
import AuthFetchUtil, {type AuthRequestInit} from '@/util/AuthFetchUtil.ts';

export function createWorkbenchPageServices(context: Pick<PluginContext, 'i18n' | 'on' | 'session' | 'onStop' | 'onDispose'>) {
    const i18n = createI18nBinding(context);
    const session = context.session;
    const sessionOptions = createSessionRequestOptions(context);
    const pending = new Set<Promise<unknown>>();
    let accepting = true;
    const canOperate = () => accepting;

    function trackWrite<T>(request: Promise<T>): Promise<T> {
        pending.add(request);
        return request.finally(() => { pending.delete(request); });
    }

    const requestOptions = (options?: AuthRequestInit): AuthRequestInit => ({...options, ...sessionOptions(options?.signal ?? undefined)});

    context.onStop({
        pause() { accepting = false; },
        async prepare() { await Promise.allSettled(pending); },
        cancel() { accepting = true; },
    });
    context.onDispose(() => { accepting = false; });

    return {
        ...i18n,
        session,
        canOperate,
        requestOptions,
        trackWrite,
        get<T>(url: string, options?: AuthRequestInit): Promise<T | null> {
            if (!canOperate()) return Promise.resolve(null);
            const request = AuthFetchUtil.get<T>(url, requestOptions(options));
            return options?.signal ? request : trackWrite(request);
        },
        post<T>(url: string, data: unknown, options?: AuthRequestInit): Promise<T | null> {
            if (!canOperate()) return Promise.resolve(null);
            const request = AuthFetchUtil.post<T>(url, data, requestOptions(options));
            return options?.signal ? request : trackWrite(request);
        },
    };
}

export type WorkbenchPageServices = ReturnType<typeof createWorkbenchPageServices>;

export function useWorkbenchLocale({i18n, subscribeLocale}: WorkbenchPageServices) {
    return useSyncExternalStore(subscribeLocale, i18n.getLocale);
}
