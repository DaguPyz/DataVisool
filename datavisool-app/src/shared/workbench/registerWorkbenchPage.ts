/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {PluginContext} from '@datavisool/sdk/plugin';
import type {NavigationMenuEntry} from '@datavisool/sdk/plugin/contracts/navigation';
import {homeRouteId, type RouteDefinition} from '@datavisool/sdk/plugin/contracts/router';

export const workbenchIconProps = {theme: 'outline', size: 18, fill: 'currentColor'} as const;

export function registerWorkbenchPage(
    context: Pick<PluginContext, 'router' | 'navigation' | 'onStop' | 'onDispose'>,
    route: RouteDefinition,
    menu: Omit<NavigationMenuEntry, 'routeId'>,
    aliases: readonly RouteDefinition[] = [],
): void {
    const routes = context.router.registerRoutes([route, ...aliases].map(item => ({...item, parentId: homeRouteId})));
    context.onStop(routes);
    context.onDispose(routes.dispose);
    const menus = context.navigation.registerMenuEntries([{...menu, routeId: route.id}]);
    context.onStop(menus);
    context.onDispose(menus.dispose);
}
