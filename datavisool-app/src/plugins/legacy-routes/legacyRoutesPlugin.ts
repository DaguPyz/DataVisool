/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {brandLogoChangedKey} from '@/contracts/brand.ts';
import {homeRouteId, routerKey} from '@/contracts/router.ts';
import {sessionKey} from '@/contracts/session.ts';
import {workbenchKey} from '@/contracts/workbench.ts';
import {bindLegacySession} from '@/util/AuthTools.ts';
import type {Plugin} from '@/visloom/index.ts';
import legacyRoutes from './legacyRoutes.tsx';
import {createLegacyWorkbenchPages} from './workbenchPages.tsx';

export function createLegacyRoutesPlugin(): Plugin {
    return {
        id: 'legacy-routes',
        requires: [routerKey, sessionKey, workbenchKey],
        provides: [],
        activate(context) {
            const pages = createLegacyWorkbenchPages(logo => {
                void context.emit(brandLogoChangedKey, logo).catch(error => console.error('Brand update notification failed.', error));
            });
            const routes = context.get(routerKey).registerRoutes([
                ...legacyRoutes,
                ...pages.map(({route}) => ({...route, parentId: homeRouteId})),
            ]);
            context.onStop(routes);
            context.onDispose(routes.dispose);
            const menus = context.get(workbenchKey).registerMenuEntries(pages.flatMap(({route, menu, accountMenuLabel}) =>
                menu || accountMenuLabel ? [{routeId: route.id, menu, accountMenuLabel}] : [],
            ));
            context.onStop(menus);
            context.onDispose(menus.dispose);
            context.onDispose(bindLegacySession(() => context.get(sessionKey)));
        },
    };
}
