/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {Navigate} from 'react-router-dom';
import {brandLogoChangedKey} from '@/contracts/brand.ts';
import {sessionChangedKey, sessionKey} from '@/contracts/session.ts';
import {uiKey} from '@/contracts/ui.ts';
import {workbenchKey, type WorkbenchPage} from '@/contracts/workbench.ts';
import type {Plugin} from '@/visloom/index.ts';
import type {WorkbenchSnapshot} from './Workbench.tsx';

interface WorkbenchPluginOptions {
    readonly homePath: string;
    readonly loginPath: string;
}

export function createWorkbenchPlugin({homePath, loginPath}: WorkbenchPluginOptions): Plugin {
    const Workbench = lazy(() => import('./Workbench.tsx'));
    return {
        id: 'workbench',
        requires: [uiKey, sessionKey],
        provides: [workbenchKey],
        activate(context) {
            const session = context.get(sessionKey);
            const pageGroups = new Set<readonly WorkbenchPage[]>();
            const listeners = new Set<() => void>();
            let active = true;
            let assembled = false;
            let acceptingOperations = true;
            let requests = new AbortController();
            let snapshot: WorkbenchSnapshot = {signal: requests.signal, logoRevisions: {}};

            const updateSnapshot = (changes: Partial<WorkbenchSnapshot> = {}) => {
                snapshot = {...snapshot, ...changes};
                for (const listener of listeners) listener();
            };
            const subscribe = (listener: () => void) => {
                listeners.add(listener);
                return () => { listeners.delete(listener); };
            };

            context.onDispose(context.on(sessionChangedKey, () => updateSnapshot()));
            context.onDispose(context.on(brandLogoChangedKey, logo => {
                const revision = Math.max(Date.now(), (snapshot.logoRevisions[logo] ?? 0) + 1);
                updateSnapshot({logoRevisions: {...snapshot.logoRevisions, [logo]: revision}});
            }));

            const routes = context.get(uiKey).registerRoutes(() => {
                assembled = true;
                const pages = [...pageGroups].flat();
                return [{
                    path: '/home',
                    id: '首页',
                    element: <Workbench pages={pages} session={session} loginPath={loginPath}
                                         canOperate={() => acceptingOperations} subscribe={subscribe}
                                         getSnapshot={() => snapshot}/>,
                    children: [...pages.map(page => page.route), {index: true, element: <Navigate to={homePath} replace/>}],
                }];
            }, [homePath, loginPath]);

            context.onStop({
                pause() { acceptingOperations = false; },
                prepare(scope) {
                    routes.prepare(scope);
                    requests.abort();
                },
                cancel() {
                    acceptingOperations = true;
                    if (requests.signal.aborted) {
                        requests = new AbortController();
                        updateSnapshot({signal: requests.signal});
                    }
                },
            });
            context.onDispose(routes.dispose);
            context.onDispose(() => {
                active = false;
                acceptingOperations = false;
                requests.abort();
                listeners.clear();
                pageGroups.clear();
            });

            context.provide(workbenchKey, {
                registerPages(pages) {
                    if (!active || assembled) throw new Error('Register workbench pages before mounting the UI.');
                    const paths = new Set([...pageGroups].flatMap(group => group.map(page => page.route.path)));
                    const group = pages.map(page => {
                        const {path, id} = page.route;
                        if (!path || path.startsWith('/')) throw new Error(`Invalid workbench page path '${path}'.`);
                        if (paths.has(path)) throw new Error(`Workbench page '${path}' is already registered.`);
                        paths.add(path);
                        return {...page, route: {...page.route, id: id ?? `workbench:${path}`}};
                    });
                    if (group.length) pageGroups.add(group);
                    return {
                        prepare(scope) {
                            if (pageGroups.has(group)) routes.prepare(scope);
                        },
                        dispose() {
                            if (!pageGroups.has(group)) return;
                            routes.prepare('plugin');
                            pageGroups.delete(group);
                        },
                    };
                },
            });
        },
    };
}
