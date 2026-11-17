/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense, type ComponentType} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createBrowserRouter, matchRoutes, RouterProvider, type RouteObject} from 'react-router-dom';
import {GlobalMessage, GlobalModal, Loading} from '@datavisool/ui';
import {uiKey, type RootProvidersProps, type UiService} from '@/contracts/ui.ts';
import {errorUiKey} from '@/plugins/error-ui/contract.ts';
import withRouteErrorElement from '@/router/withRouteErrorElement.tsx';
import type {Plugin} from '@/visloom/index.ts';

interface UiPluginOptions {
    readonly RootProviders: ComponentType<RootProvidersProps>;
    readonly homePath: string;
}

export function createUiPlugin({RootProviders, homePath}: UiPluginOptions): Plugin {
    return {
        id: 'ui',
        requires: [errorUiKey],
        provides: [uiKey],
        activate(context) {
            const {ErrorBoundary, ErrorPage} = context.get(errorUiKey);
            const routeGroups = new Set<{routes: RouteObject[]; requiredPaths: string[]}>();
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
                    const group = {routes: [...routes], requiredPaths: [...requiredPaths]};
                    if (group.routes.length || group.requiredPaths.length) routeGroups.add(group);
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
                    const routeTree = groups.flatMap(group => group.routes);
                    for (const path of groups.flatMap(group => group.requiredPaths)) {
                        const matches = matchRoutes(routeTree, path);
                        const match = matches?.[matches.length - 1];
                        const matchedPath = match?.route.path;
                        if (!match || (match.pathnameBase === '/' && (matchedPath === '*' || matchedPath === '/*'))) {
                            throw new Error(`Required route '${path}' is not registered.`);
                        }
                    }
                    const routes = withRouteErrorElement(routeTree, <ErrorPage homePath={homePath}/>);
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
