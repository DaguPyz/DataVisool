/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createBrowserRouter, RouterProvider} from 'react-router-dom';
import {DataVisoolUIProvider, GlobalMessage, GlobalModal, Loading} from '@datavisool/ui';
import dayjs from 'dayjs';
import {getLocale, startDomTranslator, tx} from '@/i18n/miniI18n.ts';
import {useLocaleVersion} from '@/i18n/useLocaleVersion.ts';
import logo from '@/images/datavisool-logo.webp';
import {errorUiKey} from '@/plugins/error-ui/contract.ts';
import routerConfig from '@/router/router.tsx';
import withRouteErrorElement from '@/router/withRouteErrorElement.tsx';
import {setFavicon} from '@/util/LogoUtil.ts';
import type {AppView} from './startApplication.ts';

const mountApp: AppView['mount'] = (container, runtime, onUnmount) => {
    const {ErrorBoundary, ErrorPage} = runtime.get(errorUiKey);
    const router = createBrowserRouter(withRouteErrorElement(routerConfig, <ErrorPage homePath="/home/console"/>));
    let root: Root | undefined;
    onUnmount(() => {
        root?.unmount();
        root = undefined;
        router.dispose();
    });

    function AppRoot() {
        useLocaleVersion();
        const locale = getLocale();
        dayjs.locale(locale === 'zh-CN' ? 'zh-cn' : 'en');

        return (
            <DataVisoolUIProvider locale={locale} translate={tx}>
                <Suspense fallback={<Loading/>}>
                    <ErrorBoundary homePath="/home/console">
                        <RouterProvider router={router}/>
                        <GlobalMessage/>
                        <GlobalModal/>
                    </ErrorBoundary>
                </Suspense>
            </DataVisoolUIProvider>
        );
    }

    root = createRoot(container);
    setFavicon('/static/logo/logo.png', logo);
    startDomTranslator();
    root.render(<AppRoot/>);
};

export const appView: AppView = {requires: [errorUiKey], mount: mountApp};
