/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy, useSyncExternalStore} from 'react';
import {navigationKey, type NavigationMenuEntry, type NavigationProps} from '@/contracts/navigation.ts';
import {routeChangedKey, routerKey} from '@/contracts/router.ts';
import {sessionChangedKey, sessionKey, type RoleType} from '@/contracts/session.ts';
import type {Plugin} from '@/visloom/index.ts';

function isVisible(entry: NavigationMenuEntry, roles: readonly RoleType[]) {
    return !entry.roles || entry.roles.some(role => roles.includes(role));
}

/**
 * 提供工作台的业务菜单。替代实现通过 `navigationKey` 接收菜单登记，以用户角色和已匹配路由决定展示与选中状态。
 * @pluginDocs
 */
export function createNavigationPlugin(): Plugin {
    const NavigationMenu = lazy(() => import('./NavigationMenu.tsx'));

    return {
        id: 'navigation',
        requires: [routerKey, sessionKey],
        provides: [navigationKey],
        activate(context) {
            const router = context.get(routerKey);
            const session = context.get(sessionKey);
            const entries = new Map<string, NavigationMenuEntry>();
            const listeners = new Set<() => void>();
            let revision = 0;
            let accepting = true;

            const getRoles = () => session.getUserInfo()?.roles ?? [];
            const subscribe = (listener: () => void) => {
                listeners.add(listener);
                return () => { listeners.delete(listener); };
            };
            const notify = () => {
                revision++;
                for (const listener of listeners) listener();
            };
            const getRevision = () => revision;
            const canNavigate = () => accepting;
            const navigate = async (routeId: string, locationKey: string | undefined) => {
                const entry = entries.get(routeId);
                if (accepting && entry && router.getLocation()?.key === locationKey && isVisible(entry, getRoles())) {
                    await router.navigate(router.pathFor(routeId));
                }
            };

            context.onDispose(context.on(routeChangedKey, notify));
            context.onDispose(context.on(sessionChangedKey, notify));
            context.onStop({
                pause() { accepting = false; },
                cancel() {
                    accepting = true;
                    notify();
                },
            });
            context.onDispose(() => {
                accepting = false;
                entries.clear();
                listeners.clear();
            });

            function Navigation({runTransition}: NavigationProps) {
                useSyncExternalStore(subscribe, getRevision);
                const roles = getRoles();
                const visible = [...entries.values()].filter(entry => isVisible(entry, roles));
                return <NavigationMenu entries={visible} location={router.getLocation()}
                                       navigate={navigate} canNavigate={canNavigate} runTransition={runTransition}/>;
            }

            context.provide(navigationKey, {
                Navigation,
                registerMenuEntries(items) {
                    if (!accepting || router.getLocation()) {
                        throw new Error('Register navigation menus before mounting the UI.');
                    }
                    const batch = new Map<string, NavigationMenuEntry>();
                    for (const item of items) {
                        if (entries.has(item.routeId) || batch.has(item.routeId)) {
                            throw new Error(`Navigation route '${item.routeId}' already has a menu entry.`);
                        }
                        batch.set(item.routeId, {...item});
                    }
                    for (const [id, item] of batch) entries.set(id, item);
                    let registered = batch.size > 0;
                    return {
                        prepare(scope) {
                            if (scope === 'plugin' && registered && router.getLocation()) {
                                throw new Error('Registered navigation menus stop with the mounted application.');
                            }
                        },
                        dispose() {
                            if (!registered) return;
                            if (router.getLocation()) throw new Error('Unmount navigation before removing its registered menus.');
                            for (const id of batch.keys()) entries.delete(id);
                            registered = false;
                        },
                    };
                },
            });
        },
    };
}
