/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createDocsPlugin} from '@/plugins/docs/docsPlugin.tsx';
import {createErrorUiPlugin} from '@/plugins/error-ui/errorUiPlugin.ts';
import {createLegacyRoutesPlugin} from '@/plugins/legacy-routes/legacyRoutesPlugin.ts';
import {createLoginPlugin} from '@/plugins/login/loginPlugin.tsx';
import {createSessionPlugin} from '@/plugins/session/sessionPlugin.ts';
import {createUiPlugin} from '@/plugins/ui/uiPlugin.tsx';
import type {Plugin} from '../visloom/index.ts';
import {AppProviders} from './AppProviders.tsx';

/** Select the built-in plugins for this application. */
export function createAppPlugins(): readonly Plugin[] {
    const homePath = '/home/console';
    return [
        createErrorUiPlugin(),
        createUiPlugin({RootProviders: AppProviders, homePath, errorPath: '/error'}),
        createDocsPlugin({workbenchPath: homePath}),
        createSessionPlugin(),
        createLoginPlugin({successPath: homePath}),
        createLegacyRoutesPlugin(),
    ];
}
