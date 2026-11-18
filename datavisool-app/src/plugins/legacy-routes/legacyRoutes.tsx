/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */


import {lazy} from "react";
import type {RouteObject} from "react-router-dom";

const DesignerViewPage = lazy(() => import('@/pages/preview/DesignerViewPage.tsx'));
const DesignerReleasePage = lazy(() => import('@/pages/release/DesignerReleasePage.tsx'));
const DesignerPage = lazy(() => import('@/pages/designer/DesignerPage.tsx'));
const Demo = lazy(() => import('@/test/Demo'));
const NotFound = lazy(() => import('@/pages/result/NotFound.tsx'));
const NoAuth = lazy(() => import('@/pages/result/NoAuth.tsx'));

export default [
    {path: '/preview', element: <DesignerViewPage/>},
    {path: '/release/:id', element: <DesignerReleasePage/>},
    {path: '/test', element: <Demo/>},
    {path: '/designer', element: <DesignerPage/>},
    {path: '/notFound', element: <NotFound/>},
    {path: '/noAuth', element: <NoAuth/>},
    {path: '*', element: <NotFound/>}
] as RouteObject[];
