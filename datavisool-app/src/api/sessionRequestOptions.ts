/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {PluginContext} from '@datavisool/sdk/plugin';
import type {AuthRequestInit} from '@/util/AuthFetchUtil.ts';
import {redirectExpiredSession} from './ReponseHandler.ts';

export function createSessionRequestOptions({session, onDispose}: Pick<PluginContext, 'session' | 'onDispose'>) {
    let loginRedirect: number | undefined;
    onDispose(() => {
        if (loginRedirect !== undefined) window.clearTimeout(loginRedirect);
    });

    return (signal?: AbortSignal): AuthRequestInit => {
        const token = session.getUserInfo()?.token ?? null;
        return {
            token,
            signal,
            onSessionExpiry() {
                if (signal?.aborted || (session.getUserInfo()?.token ?? null) !== token || loginRedirect !== undefined) return;
                loginRedirect = redirectExpiredSession(() => session.removeUser());
            },
        };
    };
}
