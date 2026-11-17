/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {useLocation} from 'react-router-dom';
import {uiKey} from '@/contracts/ui.ts';
import type {Plugin} from '@/visloom/index.ts';

interface DocsPluginOptions {
    readonly workbenchPath?: string;
}

export function createDocsPlugin({workbenchPath}: DocsPluginOptions = {}): Plugin {
    const DocsPage = lazy(() => import('./DocsPage.tsx'));
    const LegacyDocsRedirect = lazy(() => import('./LegacyDocsRedirect.tsx'));

    function DocsRoute() {
        const {search} = useLocation();
        return new URLSearchParams(search).has('legacy')
            ? <LegacyDocsRedirect/>
            : <DocsPage workbenchPath={workbenchPath}/>;
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
            ], workbenchPath ? [workbenchPath] : []);
            context.onStop(registration);
            context.onDispose(registration.dispose);
        },
    };
}
