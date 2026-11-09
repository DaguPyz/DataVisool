/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {createRoot} from "react-dom/client";
import {getLocale, startDomTranslator, tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import '@datavisool/ui/style.css';
import './index.less';
import './theme/default.less';
import {Suspense} from "react";
import {GlobalMessage, GlobalModal, DataVisoolUIProvider, Loading} from "@datavisool/ui";
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import routerConfig from "./router/router.tsx";
import {setFavicon} from "./util/LogoUtil.ts";
import logo from './images/datavisool-logo.webp';
import dayjs from "dayjs";
import AppErrorBoundary from "./components/app-error/AppErrorBoundary.tsx";
import ErrorPage from "./pages/result/Error.tsx";
import withRouteErrorElement from "./router/withRouteErrorElement.tsx";

const router = createBrowserRouter(withRouteErrorElement(routerConfig, <ErrorPage homePath="/home/console"/>));

setFavicon('/static/logo/logo.png', logo)
startDomTranslator();

function Root() {
    useLocaleVersion();
    const locale = getLocale();
    dayjs.locale(locale === 'zh-CN' ? 'zh-cn' : 'en');

    return (
        <DataVisoolUIProvider locale={locale} translate={tx}>
            <Suspense fallback={<Loading/>}>
                <AppErrorBoundary homePath="/home/console">
                    <RouterProvider router={router}/>
                    <GlobalMessage/>
                    <GlobalModal/>
                </AppErrorBoundary>
            </Suspense>
        </DataVisoolUIProvider>
    );
}

createRoot(document.getElementById('root')!).render(<Root/>);
