/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {FolderClose} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {homeRouteId, type RouterService} from '@datavisool/sdk/plugin/contracts/router';
import {createSessionRequestOptions} from '@/api/sessionRequestOptions.ts';
import {createI18nBinding} from '@/i18n/i18nBinding.ts';

const ProjectList = lazy(() => import('./ProjectList.tsx'));

/**
 * 展示和管理项目列表，提供搜索、分页、项目维护和设计器入口。
 * @pluginDocs
 */
export function createProjectListPlugin(): Plugin {
    return {
        id: 'project-list',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const {router} = context;
            const i18n = createI18nBinding(context);
            const requestOptions = createSessionRequestOptions(context);
            const pendingWrites = new Set<Promise<unknown>>();
            let acceptingOperations = true;
            const canOperate = () => acceptingOperations;
            const navigate: RouterService['navigate'] = async (path, options) => {
                if (canOperate()) await router.navigate(path, options);
            };
            const trackWrite = async <T,>(request: Promise<T>): Promise<T> => {
                pendingWrites.add(request);
                try {
                    return await request;
                } finally {
                    pendingWrites.delete(request);
                }
            };

            context.onStop({
                pause() { acceptingOperations = false; },
                async prepare() { await Promise.allSettled(pendingWrites); },
                cancel() { acceptingOperations = true; },
            });
            context.onDispose(() => { acceptingOperations = false; });

            const routeId = 'app:projects';
            const routes = router.registerRoutes([{
                id: routeId,
                parentId: homeRouteId,
                path: 'server',
                render: () => <ProjectList {...i18n} requestOptions={requestOptions} trackWrite={trackWrite}
                                            canOperate={canOperate} navigate={navigate}/>,
            }]);
            context.onStop(routes);
            context.onDispose(routes.dispose);
            const menus = context.navigation.registerMenuEntries([{
                routeId,
                label: '项目列表',
                order: 20,
                icon: <FolderClose theme="outline" size={18} fill="currentColor"/>,
            }]);
            context.onStop(menus);
            context.onDispose(menus.dispose);
        },
    };
}
