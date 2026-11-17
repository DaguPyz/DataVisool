/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createErrorUiPlugin} from '@/plugins/error-ui/errorUiPlugin.ts';
import {createLegacyRoutesPlugin} from '@/plugins/legacy-routes/legacyRoutesPlugin.ts';
import {createUiPlugin} from '@/plugins/ui/uiPlugin.tsx';
import type {Plugin} from '../visloom/index.ts';
import {AppProviders} from './AppProviders.tsx';

/** Select the built-in plugins for this application. */
export function createAppPlugins(): readonly Plugin[] {
    return [
        createErrorUiPlugin(),
        createUiPlugin({RootProviders: AppProviders, homePath: '/home/console'}),
        createLegacyRoutesPlugin(),
    ];
}
