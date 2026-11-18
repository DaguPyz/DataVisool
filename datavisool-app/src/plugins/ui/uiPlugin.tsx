/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense, type ComponentType} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {GlobalMessage, GlobalModal, Loading} from '@datavisool/ui';
import type {RootProvidersProps} from '@datavisool/sdk/plugin/contracts/ui';
import type {Plugin} from '@datavisool/sdk/plugin';
import {createI18nBinding, type I18nBinding} from '@/i18n/i18nBinding.ts';

interface UiPluginOptions {
    readonly RootProviders: ComponentType<RootProvidersProps & I18nBinding>;
    readonly homePath: string;
}

export function createUiPlugin({RootProviders, homePath}: UiPluginOptions): Plugin {
    return {
        id: 'ui',
        requires: ['errorUi', 'i18n', 'router'],
        provides: ['ui'],
        activate(context) {
            const {ErrorBoundary} = context.errorUi;
            const router = context.router;
            const i18n = createI18nBinding(context);
            let active = true;
            let mountAttempted = false;
            let root: Root | undefined;

            context.onStop({
                prepare(scope) {
                    if (scope === 'plugin' && root) throw new Error('The mounted UI stops with the application.');
                },
                withdraw() {
                    root?.unmount();
                    root = undefined;
                },
            });
            context.onDispose(() => { active = false; });

            context.provide('ui', {
                mount(container) {
                    if (!active) throw new Error('UI plugin is not active.');
                    if (mountAttempted) throw new Error('The UI can only be mounted once.');
                    mountAttempted = true;
                    const routerView = router.createView();
                    root = createRoot(container);
                    root.render(
                        <RootProviders {...i18n} renderContent={() => (
                            <Suspense fallback={<Loading/>}>
                                <ErrorBoundary homePath={homePath}>
                                    {routerView}
                                    <GlobalMessage/>
                                    <GlobalModal/>
                                </ErrorBoundary>
                            </Suspense>
                        )}/>,
                    );
                },
            });
        },
    };
}
