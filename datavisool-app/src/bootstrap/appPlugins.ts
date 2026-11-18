/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createAiModelManagementPlugin} from '@/plugins/ai-model-management/aiModelManagementPlugin.tsx';
import {createApiManagementPlugin} from '@/plugins/api-management/apiManagementPlugin.tsx';
import {createConsolePlugin} from '@/plugins/console/consolePlugin.tsx';
import {createDatabasePlugin} from '@/plugins/database/databasePlugin.tsx';
import {createDocsPlugin} from '@/plugins/docs/docsPlugin.tsx';
import {createDynamicScriptPlugin} from '@/plugins/dynamic-script/dynamicScriptPlugin.tsx';
import {createErrorUiPlugin} from '@/plugins/error-ui/errorUiPlugin.ts';
import {createFontManagementPlugin} from '@/plugins/font-management/fontManagementPlugin.tsx';
import {createHelpPlugin} from '@/plugins/help/helpPlugin.tsx';
import {createHomeLayoutPlugin} from '@/plugins/home-layout/homeLayoutPlugin.ts';
import {createI18nPlugin} from '@/plugins/i18n/i18nPlugin.ts';
import {createLegacyRoutesPlugin} from '@/plugins/legacy-routes/legacyRoutesPlugin.ts';
import {createLoginPlugin} from '@/plugins/login/loginPlugin.tsx';
import {createModelResourcePlugin} from '@/plugins/model-resource/modelResourcePlugin.tsx';
import {createNavigationPlugin} from '@/plugins/navigation/navigationPlugin.tsx';
import {createProjectListPlugin} from '@/plugins/project-list/projectListPlugin.tsx';
import {createReleaseManagementPlugin} from '@/plugins/release-management/releaseManagementPlugin.tsx';
import {createRemoteComponentPlugin} from '@/plugins/remote-component/remoteComponentPlugin.tsx';
import {createRouterPlugin} from '@/plugins/router/routerPlugin.tsx';
import {createSessionPlugin} from '@/plugins/session/sessionPlugin.ts';
import {createSettingsPlugin} from '@/plugins/settings/settingsPlugin.tsx';
import {createUiPlugin} from '@/plugins/ui/uiPlugin.tsx';
import {createUserManagementPlugin} from '@/plugins/user-management/userManagementPlugin.tsx';
import {createVideoResourcePlugin} from '@/plugins/video-resource/videoResourcePlugin.tsx';
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
        createProjectListPlugin(),
        createSettingsPlugin(),
        createHelpPlugin(),
        createDynamicScriptPlugin(),
        createDatabasePlugin(),
        createApiManagementPlugin(),
        createFontManagementPlugin(),
        createVideoResourcePlugin(),
        createModelResourcePlugin(),
        createRemoteComponentPlugin(),
        createReleaseManagementPlugin(),
        createAiModelManagementPlugin(),
        createUserManagementPlugin(),
        createLegacyRoutesPlugin(),
    ];
}
