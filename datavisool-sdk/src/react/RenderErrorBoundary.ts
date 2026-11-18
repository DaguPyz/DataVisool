/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {Component, createElement, type ComponentType, type ErrorInfo, type ReactNode} from 'react';

export interface RenderFallbackProps {
    message: string;
    detail: string;
}

let fallback: ComponentType<RenderFallbackProps> | undefined;

/** Pass undefined to restore the SDK's default fallback. */
export function setRenderErrorFallback(component?: ComponentType<RenderFallbackProps>): void {
    fallback = component;
}

interface Props {
    children: ReactNode;
    onError: (error: unknown, info: ErrorInfo) => void;
    renderAttempt: number;
}

export default class RenderErrorBoundary extends Component<Props, {hasError: boolean; renderAttempt: number}> {
    public override state = {hasError: false, renderAttempt: this.props.renderAttempt};

    public static getDerivedStateFromProps(props: Props, state: {hasError: boolean; renderAttempt: number}) {
        return props.renderAttempt === state.renderAttempt ? null : {hasError: false, renderAttempt: props.renderAttempt};
    }

    public static getDerivedStateFromError(): {hasError: boolean} {
        return {hasError: true};
    }

    public override componentDidCatch(error: unknown, info: ErrorInfo): void {
        console.error('render boundary caught error', error);
        this.props.onError(error, info);
    }

    public override render(): ReactNode {
        if (!this.state.hasError) return this.props.children;
        const props = {message: '组件渲染失败', detail: '请检查配置后重试'};
        return fallback ? createElement(fallback, props) : createElement('div', {role: 'alert'}, props.message);
    }
}
