/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */


import {lazy} from "react";
import type {RouteDefinition} from '@datavisool/sdk/plugin/contracts/router';

const DesignerViewPage = lazy(() => import('@/pages/preview/DesignerViewPage.tsx'));
const DesignerReleasePage = lazy(() => import('@/pages/release/DesignerReleasePage.tsx'));
const DesignerPage = lazy(() => import('@/pages/designer/DesignerPage.tsx'));
const Demo = lazy(() => import('@/test/Demo'));
const NotFound = lazy(() => import('@/pages/result/NotFound.tsx'));
const NoAuth = lazy(() => import('@/pages/result/NoAuth.tsx'));

export default [
    {id: 'legacy:preview', path: '/preview', render: () => <DesignerViewPage/>},
    {id: 'legacy:release', path: '/release/:id', render: () => <DesignerReleasePage/>},
    {id: 'legacy:test', path: '/test', render: () => <Demo/>},
    {id: 'legacy:designer', path: '/designer', render: () => <DesignerPage/>},
    {id: 'legacy:not-found', path: '/notFound', render: () => <NotFound/>},
    {id: 'legacy:no-auth', path: '/noAuth', render: () => <NoAuth/>},
    {id: 'legacy:fallback', path: '/*', render: () => <NotFound/>},
] satisfies readonly RouteDefinition[];
