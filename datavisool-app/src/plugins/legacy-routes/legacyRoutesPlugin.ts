/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {bindLegacySession} from '@/util/AuthTools.ts';
import {createI18nBinding} from '@/i18n/i18nBinding.ts';
import {bindLegacyI18n} from '@/i18n/miniI18n.ts';
import type {Plugin} from '@datavisool/sdk/plugin';
import {createLegacyRoutes} from './legacyRoutes.tsx';
import {createLegacyWorkbenchRoutes} from './workbenchPages.tsx';

export function createLegacyRoutesPlugin(): Plugin {
    return {
        id: 'legacy-routes',
        requires: ['designerRuntime', 'dynamicScripts', 'i18n', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const i18n = createI18nBinding(context);
            context.onDispose(bindLegacyI18n(i18n));
            const routes = context.router.registerRoutes([
                ...createLegacyRoutes(context.designerRuntime),
                ...createLegacyWorkbenchRoutes(context.dynamicScripts),
            ]);
            context.onStop(routes);
            context.onDispose(routes.dispose);
            context.onDispose(bindLegacySession(() => context.session));
        },
    };
}
