/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {sessionKey} from '@/contracts/session.ts';
import {uiKey} from '@/contracts/ui.ts';
import routerConfig from '@/router/router.tsx';
import {bindLegacySession} from '@/util/AuthTools.ts';
import type {Plugin} from '@/visloom/index.ts';

export function createLegacyRoutesPlugin(): Plugin {
    return {
        id: 'legacy-routes',
        requires: [uiKey, sessionKey],
        provides: [],
        activate(context) {
            const registration = context.get(uiKey).registerRoutes(routerConfig);
            context.onStop(registration);
            context.onDispose(registration.dispose);
            context.onDispose(bindLegacySession(() => context.get(sessionKey)));
        },
    };
}
