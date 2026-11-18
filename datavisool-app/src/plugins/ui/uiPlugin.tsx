/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense, type ComponentType} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createBrowserRouter, matchRoutes, RouterProvider} from 'react-router-dom';
import {GlobalMessage, GlobalModal, Loading} from '@datavisool/ui';
import {errorUiKey} from '@/contracts/errorUi.ts';
import {uiKey, type RootProvidersProps, type RouteSource, type UiService} from '@/contracts/ui.ts';
import type {Plugin} from '@/visloom/index.ts';
import withRouteErrorElement from './withRouteErrorElement.tsx';

interface UiPluginOptions {
    readonly RootProviders: ComponentType<RootProvidersProps>;
    readonly homePath: string;
    readonly errorPath?: string;
}

export function createUiPlugin({RootProviders, homePath, errorPath}: UiPluginOptions): Plugin {
    return {
        id: 'ui',
        requires: [errorUiKey],
        provides: [uiKey],
        activate(context) {
            const {ErrorBoundary, ErrorPage} = context.get(errorUiKey);
            const routeGroups = new Set<{routes: RouteSource; requiredPaths: string[]}>();
            let active = true;
            let mountAttempted = false;
            let router: ReturnType<typeof createBrowserRouter> | undefined;
            let root: Root | undefined;

            const requireActive = () => {
                if (!active) throw new Error('UI plugin is not active.');
            };

            context.onStop({
                prepare(scope) {
                    if (scope === 'plugin' && router) throw new Error('The mounted UI stops with the application.');
                },
                withdraw() {
                    root?.unmount();
                    root = undefined;
                    router?.dispose();
                    router = undefined;
                },
            });
            context.onDispose(() => {
                active = false;
                routeGroups.clear();
            });

            const service: UiService = {
                registerRoutes(routes, requiredPaths = []) {
                    requireActive();
                    if (mountAttempted) throw new Error('Register routes before mounting the UI.');
                    const routeSource = typeof routes === 'function' ? routes : [...routes];
                    const group = {routes: routeSource, requiredPaths: [...requiredPaths]};
                    if (typeof routeSource === 'function' || routeSource.length || group.requiredPaths.length) {
                        routeGroups.add(group);
                    }
                    return {
                        prepare(scope) {
                            if (scope === 'plugin' && router && routeGroups.has(group)) {
                                throw new Error('Registered routes stop with the mounted application.');
                            }
                        },
                        dispose() {
                            if (router && routeGroups.has(group)) {
                                throw new Error('Unmount the UI before removing registered routes.');
                            }
                            routeGroups.delete(group);
                        },
                    };
                },
                mount(container) {
                    requireActive();
                    if (mountAttempted) throw new Error('The UI can only be mounted once.');
                    mountAttempted = true;
                    const groups = [...routeGroups];
                    const routeTree = groups.flatMap(({routes}) => typeof routes === 'function' ? routes() : routes);
                    const errorPage = <ErrorPage homePath={homePath}/>;
                    if (errorPath) routeTree.push({path: errorPath, element: errorPage});
                    for (const path of groups.flatMap(group => group.requiredPaths)) {
                        const matches = matchRoutes(routeTree, path);
                        const match = matches?.[matches.length - 1];
                        const matchedPath = match?.route.path;
                        if (!match || (match.pathnameBase === '/' && (matchedPath === '*' || matchedPath === '/*'))) {
                            throw new Error(`Required route '${path}' is not registered.`);
                        }
                    }
                    const routes = withRouteErrorElement(routeTree, errorPage);
                    const mountedRouter = createBrowserRouter(routes);
                    router = mountedRouter;
                    root = createRoot(container);
                    root.render(
                        <RootProviders renderContent={() => (
                            <Suspense fallback={<Loading/>}>
                                <ErrorBoundary homePath={homePath}>
                                    <RouterProvider router={mountedRouter}/>
                                    <GlobalMessage/>
                                    <GlobalModal/>
                                </ErrorBoundary>
                            </Suspense>
                        )}/>,
                    );
                },
            };
            context.provide(uiKey, service);
        },
    };
}
