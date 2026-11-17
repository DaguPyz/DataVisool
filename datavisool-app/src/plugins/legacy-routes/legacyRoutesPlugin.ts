/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {uiKey} from '@/plugins/ui/contract.ts';
import routerConfig from '@/router/router.tsx';
import type {Plugin} from '@/visloom/index.ts';

export function createLegacyRoutesPlugin(): Plugin {
    return {
        id: 'legacy-routes',
        requires: [uiKey],
        provides: [],
        activate(context) {
            const registration = context.get(uiKey).registerRoutes(routerConfig);
            context.onStop(registration);
            context.onDispose(registration.dispose);
        },
    };
}
