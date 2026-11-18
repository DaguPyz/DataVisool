/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';

interface LoginPluginOptions {
    /** 宿主指定的登录成功跳转地址。 */
    readonly successPath: string;
}

/** @publicRoutes */
const loginRoutes = [
    {id: 'login:root', path: '/'},
    {id: 'login:form', path: '/login'},
] as const;

/**
 * 提供工作台登录入口。登录成功后通过会话能力保存会话，再跳转到宿主指定的页面。
 * 应用关闭时取消进行中的登录请求并撤销路由登记。
 * @pluginDocs
 */
export function createLoginPlugin({successPath}: LoginPluginOptions): Plugin {
    const Login = lazy(() => import('./Login.tsx'));

    return {
        id: 'login',
        requires: ['router', 'session'],
        provides: [],
        activate(context) {
            let acceptingLogins = true;
            let requests = new AbortController();
            const getRequestSignal = () => acceptingLogins ? requests.signal : null;
            const router = context.router;
            const session = context.session;
            const renderLogin = () => <Login session={session} getRequestSignal={getRequestSignal}
                                             onLoginSuccess={() => router.navigate(successPath)}/>;
            const registration = router.registerRoutes(
                loginRoutes.map(route => ({...route, render: renderLogin})),
                [successPath],
            );
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
