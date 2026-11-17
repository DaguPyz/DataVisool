/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {sessionKey} from '@/contracts/session.ts';
import {uiKey} from '@/contracts/ui.ts';
import type {Plugin} from '@/visloom/index.ts';

interface LoginPluginOptions {
    readonly successPath: string;
}

export function createLoginPlugin({successPath}: LoginPluginOptions): Plugin {
    const Login = lazy(() => import('./Login.tsx'));

    return {
        id: 'login',
        requires: [uiKey, sessionKey],
        provides: [],
        activate(context) {
            let acceptingLogins = true;
            let requests = new AbortController();
            const getRequestSignal = () => acceptingLogins ? requests.signal : null;
            const loginPage = <Login session={context.get(sessionKey)} getRequestSignal={getRequestSignal}
                                     successPath={successPath}/>;
            const registration = context.get(uiKey).registerRoutes([
                {path: '/', element: loginPage},
                {path: '/login', element: loginPage},
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
