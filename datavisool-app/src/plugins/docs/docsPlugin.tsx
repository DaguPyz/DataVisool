/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {RouteRenderContext} from '@/contracts/router.ts';
import type {Plugin} from '@/visloom/index.ts';

interface DocsPluginOptions {
    readonly workbenchPath?: string;
}

export function createDocsPlugin({workbenchPath}: DocsPluginOptions = {}): Plugin {
    const DocsPage = lazy(() => import('./DocsPage.tsx'));
    const LegacyDocsRedirect = lazy(() => import('./LegacyDocsRedirect.tsx'));

    return {
        id: 'docs',
        requires: ['router'],
        provides: [],
        activate(context) {
            const router = context.router;
            const redirect = ({location}: RouteRenderContext) => (
                <LegacyDocsRedirect location={location} navigate={router.navigate}/>
            );
            const registration = router.registerRoutes([
                {id: 'docs:root', path: '/docs', render: redirect},
                {
                    id: 'docs:zh-cn',
                    path: '/docs/zh-cn/*',
                    render: route => new URLSearchParams(route.location.search).has('legacy')
                        ? redirect(route)
                        : <DocsPage workbenchPath={workbenchPath} location={route.location} router={router}/>,
                },
                {id: 'docs:legacy', path: '/docs/*', render: redirect},
            ], workbenchPath ? [workbenchPath] : []);
            context.onStop(registration);
            context.onDispose(registration.dispose);
        },
    };
}
