/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {brandLogoChangedKey} from '@/contracts/brand.ts';
import {homeLayoutKey} from '@/contracts/homeLayout.ts';
import {navigationKey} from '@/contracts/navigation.ts';
import {homeRouteId, routerKey} from '@/contracts/router.ts';
import {sessionChangedKey, sessionKey} from '@/contracts/session.ts';
import {workbenchKey, type WorkbenchAccountEntry} from '@/contracts/workbench.ts';
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
        requires: [homeLayoutKey, navigationKey, routerKey, sessionKey],
        provides: [workbenchKey],
        activate(context) {
            const {Layout} = context.get(homeLayoutKey);
            const {Navigation} = context.get(navigationKey);
            const session = context.get(sessionKey);
            const router = context.get(routerKey);
            const accountGroups = new Set<readonly WorkbenchAccountEntry[]>();
            const listeners = new Set<() => void>();
            let active = true;
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

            const routes = router.registerRoutes([
                {
                    id: homeRouteId,
                    path: '/home',
                    render: ({outlet, location}) => (
                        <Workbench Layout={Layout} Navigation={Navigation} accountEntries={[...accountGroups].flat()}
                                   outlet={outlet} location={location}
                                   router={router} session={session} loginPath={loginPath}
                                   canOperate={() => acceptingOperations} subscribe={subscribe} getSnapshot={() => snapshot}/>
                    ),
                },
                {id: 'app:home-index', parentId: homeRouteId, index: true, redirectTo: homePath},
            ], [homePath, loginPath]);

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
                accountGroups.clear();
            });

            context.provide(workbenchKey, {
                registerAccountEntries(entries) {
                    if (!active || router.getLocation()) throw new Error('Register account entries before mounting the UI.');
                    const group = [...entries];
                    if (group.length) accountGroups.add(group);
                    return {
                        prepare(scope) {
                            if (scope === 'plugin' && router.getLocation() && accountGroups.has(group)) {
                                throw new Error('Registered account entries stop with the mounted application.');
                            }
                        },
                        dispose() {
                            if (router.getLocation() && accountGroups.has(group)) {
                                throw new Error('Unmount the workbench before removing registered account entries.');
                            }
                            accountGroups.delete(group);
                        },
                    };
                },
            });
        },
    };
}
