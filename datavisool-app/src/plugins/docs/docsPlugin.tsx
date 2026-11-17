/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {useLocation} from 'react-router-dom';
import {uiKey} from '@/contracts/ui.ts';
import type {Plugin} from '@/visloom/index.ts';

export function createDocsPlugin(): Plugin {
    const DocsPage = lazy(() => import('@/pages/docs/DocsPage.tsx'));
    const LegacyDocsRedirect = lazy(() => import('@/pages/docs/LegacyDocsRedirect.tsx'));

    function DocsRoute() {
        const {search} = useLocation();
        return new URLSearchParams(search).has('legacy') ? <LegacyDocsRedirect/> : <DocsPage/>;
    }

    return {
        id: 'docs',
        requires: [uiKey],
        provides: [],
        activate(context) {
            const registration = context.get(uiKey).registerRoutes([
                {path: '/docs', element: <LegacyDocsRedirect/>},
                {path: '/docs/zh-cn/*', element: <DocsRoute/>},
                {path: '/docs/*', element: <LegacyDocsRedirect/>},
            ]);
            context.onStop(registration);
            context.onDispose(registration.dispose);
        },
    };
}
