/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {AnchorHTMLAttributes, ComponentType, ReactNode} from 'react';
import {createEventKey, type PluginStopScope} from '../../plugin.js';

/** The published route ID for plugins that contribute pages under /home. */
export const homeRouteId = 'app:home';

export interface RouteLocation {
    readonly key: string;
    readonly pathname: string;
    readonly search: string;
    readonly hash: string;
    readonly matchedRouteIds: readonly string[];
}

export interface RouteRenderContext {
    readonly location: RouteLocation;
    readonly params: Readonly<Record<string, string | undefined>>;
    readonly outlet: ReactNode;
}

type RouteContent =
    | {readonly render: (context: RouteRenderContext) => ReactNode; readonly redirectTo?: never}
    | {readonly render?: never; readonly redirectTo: string};

export type RouteDefinition = RouteContent & {readonly id: string} & (
    | {readonly parentId?: string; readonly index?: false; readonly path: string}
    | {readonly parentId: string; readonly index: true; readonly path?: never}
);

export interface RouteRegistration {
    /** Register this preparation through context.onStop. */
    prepare(scope: PluginStopScope): void;
    /** Register this cleanup through context.onDispose. */
    dispose(): void;
}

export type RouteLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    readonly to: string;
    readonly replace?: boolean;
};

export interface RouterService {
    readonly Link: ComponentType<RouteLinkProps>;
    /** Register during activation. Root paths are absolute and child paths are relative. */
    registerRoutes(routes: readonly RouteDefinition[], requiredPaths?: readonly string[]): RouteRegistration;
    /** Assemble the routes after all plugins have activated and return the view for the UI to mount. */
    createView(): ReactNode;
    getLocation(): RouteLocation | undefined;
    /** Resolve a registered route ID to a browser path after assembly. Pass decoded parameter values. */
    pathFor(routeId: string, params?: Readonly<Record<string, string | null>>): string;
    /** Navigate to an absolute application path. */
    navigate(to: string, options?: {readonly replace?: boolean}): Promise<void>;
}

declare module '../../plugin.js' {
    interface PluginServices {
        router: RouterService;
    }
}
export const routeChangedKey = createEventKey<RouteLocation>('app/router/changed');
