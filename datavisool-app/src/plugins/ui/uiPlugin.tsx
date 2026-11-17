/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense, type ComponentType} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createBrowserRouter, RouterProvider, type RouteObject} from 'react-router-dom';
import {GlobalMessage, GlobalModal, Loading} from '@datavisool/ui';
import {errorUiKey} from '@/plugins/error-ui/contract.ts';
import withRouteErrorElement from '@/router/withRouteErrorElement.tsx';
import type {Plugin} from '@/visloom/index.ts';
import {uiKey, type RootProvidersProps, type UiService} from './contract.ts';

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
            const routeGroups = new Set<readonly RouteObject[]>();
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
                registerRoutes(routes) {
                    requireActive();
                    if (mountAttempted) throw new Error('Register routes before mounting the UI.');
                    const group = [...routes];
                    if (group.length) routeGroups.add(group);
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
                    const routes = withRouteErrorElement([...routeGroups].flat(), <ErrorPage homePath={homePath}/>);
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
