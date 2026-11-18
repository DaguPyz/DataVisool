/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense, type ComponentType} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {GlobalMessage, GlobalModal, Loading} from '@datavisool/ui';
import type {RootProvidersProps} from '@/contracts/ui.ts';
import type {Plugin} from '@/visloom/index.ts';

interface UiPluginOptions {
    readonly RootProviders: ComponentType<RootProvidersProps>;
    readonly homePath: string;
}

export function createUiPlugin({RootProviders, homePath}: UiPluginOptions): Plugin {
    return {
        id: 'ui',
        requires: ['errorUi', 'router'],
        provides: ['ui'],
        activate(context) {
            const {ErrorBoundary} = context.errorUi;
            const router = context.router;
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
                        <RootProviders renderContent={() => (
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
