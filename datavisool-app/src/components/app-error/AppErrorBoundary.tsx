/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component, type ReactNode} from "react";
import ErrorPage from "../../pages/result/Error.tsx";

export interface AppErrorBoundaryProps {
    children: ReactNode;
    homePath: string;
    homeText?: string;
    reloadText?: string;
    backText?: string;
}

interface AppErrorBoundaryState {
    hasError: boolean;
    errorCode: string;
}

const buildErrorCode = () => {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ERR-${stamp}-${suffix}`;
};

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    public override state: AppErrorBoundaryState = {
        hasError: false,
        errorCode: buildErrorCode(),
    };

    public static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
        return {
            hasError: true,
            errorCode: buildErrorCode(),
        };
    }

    public override componentDidCatch(error: unknown): void {
        console.error("app error boundary caught error", error);
    }

    public override render(): ReactNode {
        if (this.state.hasError) {
            return (
                <ErrorPage
                    homePath={this.props.homePath}
                    homeText={this.props.homeText}
                    reloadText={this.props.reloadText}
                    backText={this.props.backText}
                    errorCode={this.state.errorCode}
                />
            );
        }
        return this.props.children;
    }
}
