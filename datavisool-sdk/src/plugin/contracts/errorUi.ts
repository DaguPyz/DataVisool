/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType, ReactNode} from 'react';

export interface AppErrorBoundaryProps {
    children: ReactNode;
    homePath: string;
    homeText?: string;
    reloadText?: string;
    backText?: string;
}

export interface ErrorPageProps {
    title?: string;
    description?: string;
    homePath: string;
    errorCode?: string;
    homeText?: string;
    reloadText?: string;
    backText?: string;
    onHome?: () => void;
    onReload?: () => void;
    onBack?: () => void;
}

export interface ErrorUiService {
    readonly ErrorBoundary: ComponentType<AppErrorBoundaryProps>;
    readonly ErrorPage: ComponentType<ErrorPageProps>;
}

declare module '../../plugin.js' {
    interface PluginServices {
        errorUi: ErrorUiService;
    }
}
