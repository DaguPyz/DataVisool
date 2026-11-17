/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component, type ReactNode} from "react";
import type {AppErrorBoundaryProps} from "@/contracts/errorUi.ts";
import {buildErrorCode} from "./buildErrorCode.ts";
import ErrorPage from "./ErrorPage.tsx";

interface AppErrorBoundaryState {
    hasError: boolean;
    errorCode: string;
}

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
