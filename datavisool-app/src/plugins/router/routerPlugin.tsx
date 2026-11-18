/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createBrowserRouter, generatePath, Link, matchRoutes, RouterProvider} from 'react-router-dom';
import {errorUiKey} from '@/contracts/errorUi.ts';
import {
    routeChangedKey, routerKey, type RouteDefinition, type RouteLinkProps, type RouteLocation, type RouterService,
} from '@/contracts/router.ts';
import type {Plugin} from '@/visloom/index.ts';
import {buildRouteTree, createLocationSnapshot} from './buildRouteTree.tsx';

interface RouterPluginOptions {
    readonly homePath: string;
    readonly errorPath?: string;
}

export function createRouterPlugin({homePath, errorPath}: RouterPluginOptions): Plugin {
    return {
        id: 'router',
        requires: [errorUiKey],
        provides: [routerKey],
        activate(context) {
            const {ErrorPage} = context.get(errorUiKey);
            const groups = new Set<{routes: readonly RouteDefinition[]; requiredPaths: readonly string[]}>();
            let active = true;
            let acceptingNavigation = true;
            let viewAttempted = false;
            let router: ReturnType<typeof createBrowserRouter> | undefined;
            let paths = new Map<string, string>();
            let location: RouteLocation | undefined;
            let unsubscribe: (() => void) | undefined;

            context.onStop({
                pause() { acceptingNavigation = false; },
                cancel() { acceptingNavigation = true; },
                withdraw() {
                    unsubscribe?.();
                    unsubscribe = undefined;
                    router?.dispose();
                    router = undefined;
                    paths.clear();
                    location = undefined;
                },
            });
            context.onDispose(() => {
                active = false;
                groups.clear();
            });

            function RouteLink({onClick, ...props}: RouteLinkProps) {
                return <Link {...props} onClick={event => {
                    if (acceptingNavigation) onClick?.(event);
                    else event.preventDefault();
                }}/>;
            }

            const service: RouterService = {
                Link: RouteLink,
                registerRoutes(routes, requiredPaths = []) {
                    if (!active || !acceptingNavigation || viewAttempted) {
                        throw new Error('Register routes before creating the router view.');
                    }
                    const group = {routes: routes.map(route => ({...route})), requiredPaths: [...requiredPaths]};
                    if (group.routes.length || group.requiredPaths.length) groups.add(group);
                    return {
                        prepare(scope) {
                            if (scope === 'plugin' && router && groups.has(group)) {
                                throw new Error('Registered routes stop with the mounted application.');
                            }
                        },
                        dispose() {
                            if (router && groups.has(group)) throw new Error('Unmount the router before removing registered routes.');
                            groups.delete(group);
                        },
                    };
                },
                createView() {
                    if (!active || !acceptingNavigation || viewAttempted) {
                        throw new Error('Create the router view once while the router plugin is active.');
                    }
                    viewAttempted = true;
                    const registered = [...groups];
                    const definitions = registered.flatMap(group => group.routes);
                    const errorPage = <ErrorPage homePath={homePath}/>;
                    if (errorPath) definitions.push({id: 'app:error', path: errorPath, render: () => errorPage});
                    const tree = buildRouteTree(definitions, errorPage);
                    for (const path of registered.flatMap(group => group.requiredPaths)) {
                        const match = matchRoutes(tree.routes, path)?.at(-1);
                        if (!match || (match.pathnameBase === '/' && match.route.path?.replace(/\/+$/, '') === '/*')) {
                            throw new Error(`Required route '${path}' is not registered.`);
                        }
                    }
                    const mountedRouter = createBrowserRouter(tree.routes);
                    router = mountedRouter;
                    paths = tree.paths;
                    let lastLocation = mountedRouter.state.location;
                    location = createLocationSnapshot(lastLocation, mountedRouter.state.matches.map(match => match.route.id));
                    unsubscribe = mountedRouter.subscribe(state => {
                        if (state.location === lastLocation) return;
                        lastLocation = state.location;
                        location = createLocationSnapshot(state.location, state.matches.map(match => match.route.id));
                        if (acceptingNavigation) {
                            void context.emit(routeChangedKey, location).catch(error => console.error('Route change notification failed.', error));
                        }
                    });
                    return <RouterProvider router={mountedRouter}/>;
                },
                getLocation: () => location,
                pathFor(routeId, params) {
                    const path = paths.get(routeId);
                    if (path === undefined) throw new Error(`Route '${routeId}' is not available.`);
                    const encodedParams = params && Object.fromEntries(Object.entries(params).map(([name, value]) => {
                        if (value === null) return [name, null];
                        const segments = name === '*' ? value.split('/') : [value];
                        return [name, segments.map(encodeURIComponent).join('/')];
                    }));
                    return generatePath(path, encodedParams);
                },
                async navigate(to, options) {
                    if (!router || !acceptingNavigation) return;
                    if (!to.startsWith('/') || to.startsWith('//')) {
                        throw new Error(`Invalid navigation target '${to}'. Use an absolute application path.`);
                    }
                    await router.navigate(to, options);
                },
            };
            context.provide(routerKey, service);
        },
    };
}
