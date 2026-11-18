/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {brandLogoChangedKey} from '@/contracts/brand.ts';
import {homeRouteId} from '@/contracts/router.ts';
import {bindLegacySession} from '@/util/AuthTools.ts';
import type {Plugin} from '@/visloom/index.ts';
import legacyRoutes from './legacyRoutes.tsx';
import {createLegacyWorkbenchPages} from './workbenchPages.tsx';

export function createLegacyRoutesPlugin(): Plugin {
    return {
        id: 'legacy-routes',
        requires: ['navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const pages = createLegacyWorkbenchPages(logo => {
                void context.emit(brandLogoChangedKey, logo).catch(error => console.error('Brand update notification failed.', error));
            });
            const routes = context.router.registerRoutes([
                ...legacyRoutes,
                ...pages.map(({route}) => ({...route, parentId: homeRouteId})),
            ]);
            context.onStop(routes);
            context.onDispose(routes.dispose);
            const menus = context.navigation.registerMenuEntries(pages.flatMap(({route, menu}) =>
                menu ? [{routeId: route.id, ...menu}] : [],
            ));
            context.onStop(menus);
            context.onDispose(menus.dispose);
            const account = context.workbench.registerAccountEntries(pages.flatMap(({route, accountMenuLabel}) =>
                accountMenuLabel ? [{routeId: route.id, label: accountMenuLabel}] : [],
            ));
            context.onStop(account);
            context.onDispose(account.dispose);
            context.onDispose(bindLegacySession(() => context.session));
        },
    };
}
