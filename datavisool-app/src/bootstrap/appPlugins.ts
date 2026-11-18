/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createConsolePlugin} from '@/plugins/console/consolePlugin.tsx';
import {createDocsPlugin} from '@/plugins/docs/docsPlugin.tsx';
import {createErrorUiPlugin} from '@/plugins/error-ui/errorUiPlugin.ts';
import {createHomeLayoutPlugin} from '@/plugins/home-layout/homeLayoutPlugin.ts';
import {createI18nPlugin} from '@/plugins/i18n/i18nPlugin.ts';
import {createLegacyRoutesPlugin} from '@/plugins/legacy-routes/legacyRoutesPlugin.ts';
import {createLoginPlugin} from '@/plugins/login/loginPlugin.tsx';
import {createNavigationPlugin} from '@/plugins/navigation/navigationPlugin.tsx';
import {createRouterPlugin} from '@/plugins/router/routerPlugin.tsx';
import {createSessionPlugin} from '@/plugins/session/sessionPlugin.ts';
import {createUiPlugin} from '@/plugins/ui/uiPlugin.tsx';
import {createWorkbenchPlugin} from '@/plugins/workbench/workbenchPlugin.tsx';
import type {Plugin} from '@datavisool/sdk/plugin';
import {AppProviders} from './AppProviders.tsx';

/** Select the built-in plugins for this application. */
export function createAppPlugins(): readonly Plugin[] {
    const homePath = '/home/console';
    return [
        createErrorUiPlugin(),
        createI18nPlugin(),
        createRouterPlugin({homePath, errorPath: '/error'}),
        createUiPlugin({RootProviders: AppProviders, homePath}),
        createDocsPlugin({workbenchPath: homePath}),
        createSessionPlugin(),
        createLoginPlugin({successPath: homePath}),
        createHomeLayoutPlugin(),
        createNavigationPlugin(),
        createWorkbenchPlugin({homePath, loginPath: '/login'}),
        createConsolePlugin(),
        createLegacyRoutesPlugin(),
    ];
}
