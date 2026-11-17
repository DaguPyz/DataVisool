/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createBrowserRouter, RouterProvider} from 'react-router-dom';
import {DataVisoolUIProvider, GlobalMessage, GlobalModal, Loading} from '@datavisool/ui';
import dayjs from 'dayjs';
import AppErrorBoundary from '@/components/app-error/AppErrorBoundary.tsx';
import {getLocale, startDomTranslator, tx} from '@/i18n/miniI18n.ts';
import {useLocaleVersion} from '@/i18n/useLocaleVersion.ts';
import logo from '@/images/datavisool-logo.webp';
import ErrorPage from '@/pages/result/Error.tsx';
import routerConfig from '@/router/router.tsx';
import withRouteErrorElement from '@/router/withRouteErrorElement.tsx';
import {setFavicon} from '@/util/LogoUtil.ts';

export function mountApp(container: HTMLElement): void {
    const router = createBrowserRouter(withRouteErrorElement(routerConfig, <ErrorPage homePath="/home/console"/>));

    function AppRoot() {
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

    let root: Root | undefined;
    try {
        root = createRoot(container);
        setFavicon('/static/logo/logo.png', logo);
        startDomTranslator();
        root.render(<AppRoot/>);
    } catch (error) {
        const errors = [error];
        for (const cleanup of [() => root?.unmount(), () => router.dispose()]) {
            try {
                cleanup();
            } catch (cleanupError) {
                errors.push(cleanupError);
            }
        }
        if (errors.length > 1) throw new AggregateError(errors, 'DataVisool view setup and cleanup failed.');
        throw error;
    }
}
