/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {brandLogoChangedKey} from '@/contracts/brand.ts';
import {sessionKey} from '@/contracts/session.ts';
import {uiKey} from '@/contracts/ui.ts';
import {workbenchKey} from '@/contracts/workbench.ts';
import {bindLegacySession} from '@/util/AuthTools.ts';
import type {Plugin} from '@/visloom/index.ts';
import legacyRoutes from './legacyRoutes.tsx';
import {createLegacyWorkbenchPages} from './workbenchPages.tsx';

export function createLegacyRoutesPlugin(): Plugin {
    return {
        id: 'legacy-routes',
        requires: [uiKey, sessionKey, workbenchKey],
        provides: [],
        activate(context) {
            const routes = context.get(uiKey).registerRoutes(legacyRoutes);
            context.onStop(routes);
            context.onDispose(routes.dispose);
            const pages = context.get(workbenchKey).registerPages(createLegacyWorkbenchPages(logo => {
                void context.emit(brandLogoChangedKey, logo).catch(error => console.error('Brand update notification failed.', error));
            }));
            context.onStop(pages);
            context.onDispose(pages.dispose);
            context.onDispose(bindLegacySession(() => context.get(sessionKey)));
        },
    };
}
