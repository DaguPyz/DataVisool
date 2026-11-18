/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {routerKey} from '@/contracts/router.ts';
import {sessionKey} from '@/contracts/session.ts';
import type {Plugin} from '@/visloom/index.ts';

interface LoginPluginOptions {
    readonly successPath: string;
}

export function createLoginPlugin({successPath}: LoginPluginOptions): Plugin {
    const Login = lazy(() => import('./Login.tsx'));

    return {
        id: 'login',
        requires: [routerKey, sessionKey],
        provides: [],
        activate(context) {
            let acceptingLogins = true;
            let requests = new AbortController();
            const getRequestSignal = () => acceptingLogins ? requests.signal : null;
            const router = context.get(routerKey);
            const session = context.get(sessionKey);
            const renderLogin = () => <Login session={session} getRequestSignal={getRequestSignal}
                                             onLoginSuccess={() => router.navigate(successPath)}/>;
            const registration = router.registerRoutes([
                {id: 'login:root', path: '/', render: renderLogin},
                {id: 'login:form', path: '/login', render: renderLogin},
            ], [successPath]);
            context.onStop({
                pause() {
                    acceptingLogins = false;
                },
                prepare(scope) {
                    registration.prepare(scope);
                    requests.abort();
                },
                cancel() {
                    if (requests.signal.aborted) requests = new AbortController();
                    acceptingLogins = true;
                },
            });
            context.onDispose(registration.dispose);
            context.onDispose(() => requests.abort());
        },
    };
}
