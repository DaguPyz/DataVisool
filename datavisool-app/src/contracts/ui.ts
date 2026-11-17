/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ReactNode} from 'react';
import type {RouteObject} from 'react-router-dom';
import {createServiceKey, type PluginStopScope} from '@/visloom/index.ts';

export interface RootProvidersProps {
    readonly renderContent: () => ReactNode;
}

export interface RouteRegistration {
    /** Register this preparation through context.onStop. */
    prepare(scope: PluginStopScope): void;
    /** Register this cleanup through context.onDispose. */
    dispose(): void;
}

export interface UiService {
    /** Register a route tree and check its required destinations when the UI mounts. */
    registerRoutes(routes: readonly RouteObject[], requiredPaths?: readonly string[]): RouteRegistration;
    /** Build the router and attach the root view after all startup plugins have activated. */
    mount(container: HTMLElement): void;
}

export const uiKey = createServiceKey<UiService>('app/ui');
