/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */


import {lazy} from "react";
import type {RouteDefinition} from '@datavisool/sdk/plugin/contracts/router';
import type {DesignerRuntimeService} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {DesignerMode} from '@datavisool/sdk/types';

const Demo = lazy(() => import('@/test/Demo'));
const NotFound = lazy(() => import('@/pages/result/NotFound.tsx'));
const NoAuth = lazy(() => import('@/pages/result/NoAuth.tsx'));

export function createLegacyRoutes(runtime: DesignerRuntimeService): readonly RouteDefinition[] {
    const Preview = lazy(async () => {
        const [{default: Page}, createSession] = await Promise.all([
            import('@/pages/preview/DesignerViewPage.tsx'),
            runtime.prepare(DesignerMode.PREVIEW),
        ]);
        return {default: () => <Page createSession={createSession}/>};
    });
    const Release = lazy(async () => {
        const [{default: Page}, createSession] = await Promise.all([
            import('@/pages/release/DesignerReleasePage.tsx'),
            runtime.prepare(DesignerMode.RELEASE),
        ]);
        return {default: () => <Page createSession={createSession}/>};
    });

    return [
        {id: 'legacy:preview', path: '/preview', render: () => <Preview/>},
        {id: 'legacy:release', path: '/release/:id', render: () => <Release/>},
        {id: 'legacy:test', path: '/test', render: () => <Demo/>},
        {id: 'legacy:not-found', path: '/notFound', render: () => <NotFound/>},
        {id: 'legacy:no-auth', path: '/noAuth', render: () => <NoAuth/>},
        {id: 'legacy:fallback', path: '/*', render: () => <NotFound/>},
    ];
}
