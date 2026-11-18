/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {DashboardOne} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {homeRouteId} from '@datavisool/sdk/plugin/contracts/router';
import type {IProjectInfoManager} from '@datavisool/sdk/types';
import {createProject} from '@/api/engineering/createProject.ts';
import {createSessionRequestOptions} from '@/api/sessionRequestOptions.ts';
import {createI18nBinding} from '@/i18n/i18nBinding.ts';
import AuthFetchUtil from '@/util/AuthFetchUtil.ts';

const ConsoleDashboard = lazy(() => import('./ConsoleDashboard.tsx'));

/**
 * 在工作台首页展示项目、资源和发布概览，并提供新建项目入口。
 * @pluginDocs
 */
export function createConsolePlugin(): Plugin {
    return {
        id: 'console',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const i18n = createI18nBinding(context);
            const {router} = context;
            const requestOptions = createSessionRequestOptions(context);
            const pendingCreations = new Set<Promise<string | null>>();
            let acceptingOperations = true;
            const post = <T,>(path: string, data: unknown, signal: AbortSignal): Promise<T> =>
                AuthFetchUtil.post<T>(path, data, requestOptions(signal));
            const submitProject = async (project: IProjectInfoManager): Promise<string | null> => {
                const request = createProject(project, requestOptions());
                pendingCreations.add(request);
                try {
                    return await request;
                } finally {
                    pendingCreations.delete(request);
                }
            };
            const canOperate = () => acceptingOperations;
            const navigate = async (path: string) => {
                if (canOperate()) await router.navigate(path);
            };

            context.onStop({
                pause() { acceptingOperations = false; },
                async prepare() { await Promise.allSettled(pendingCreations); },
                cancel() { acceptingOperations = true; },
            });
            context.onDispose(() => {
                acceptingOperations = false;
            });

            const routeId = 'app:console';
            const routes = router.registerRoutes([{
                id: routeId,
                parentId: homeRouteId,
                path: 'console',
                render: () => <ConsoleDashboard {...i18n} post={post} createProject={submitProject}
                                                canOperate={canOperate} navigate={navigate}/>,
            }]);
            context.onStop(routes);
            context.onDispose(routes.dispose);
            const menus = context.navigation.registerMenuEntries([{
                routeId,
                label: '控制台',
                order: 10,
                icon: <DashboardOne theme="outline" size={18} fill="currentColor"/>,
            }]);
            context.onStop(menus);
            context.onDispose(menus.dispose);
        },
    };
}
