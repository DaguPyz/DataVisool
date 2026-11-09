/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component, type CSSProperties, type ErrorInfo, type ReactNode} from "react";
import RenderFaultPanel from "./RenderFaultPanel.tsx";

export interface RenderErrorBoundaryProps {
    children: ReactNode;
    fallbackText?: string;
    className?: string;
    style?: CSSProperties;
    onError?: (error: unknown, info: ErrorInfo) => void;
}

interface RenderErrorBoundaryState {
    hasError: boolean;
}

export default class RenderErrorBoundary extends Component<RenderErrorBoundaryProps, RenderErrorBoundaryState> {
    public override state: RenderErrorBoundaryState = {
        hasError: false,
    };

    public static getDerivedStateFromError(): RenderErrorBoundaryState {
        return {
            hasError: true,
        };
    }

    public override componentDidCatch(error: unknown, info: ErrorInfo): void {
        console.error("render boundary caught error", error);
        this.props.onError?.(error, info);
    }

    public override render(): ReactNode {
        if (this.state.hasError) {
            return (
                <RenderFaultPanel
                    className={this.props.className}
                    style={this.props.style}
                    message={this.props.fallbackText ?? "组件渲染失败"}
                    detail="请检查配置后重试"
                />
            );
        }
        return this.props.children;
    }
}
