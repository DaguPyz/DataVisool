/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ComponentUtil as SharedComponentUtil} from '@datavisool/sdk/react';
import {createElement, forwardRef, type ClassType, type ReactNode, type Ref} from 'react';
import {DataVisoolUIProvider} from '@datavisool/ui';
import {getLocale, tx} from '@/i18n/miniI18n';
import {useLocaleVersion} from '@/i18n/useLocaleVersion';
import RenderErrorBoundary from './RenderErrorBoundary.tsx';

function HostComponentUIProvider({children}: {children: ReactNode}) {
    useLocaleVersion();
    return createElement(DataVisoolUIProvider, {locale: getLocale(), translate: tx, children});
}

function acceptsComponentRef(template: unknown): boolean {
    const visited = new Set<object>();
    let component = template;
    while (component && (typeof component === 'object' || typeof component === 'function')) {
        if (visited.has(component as object)) return false;
        visited.add(component as object);
        const candidate = component as {$$typeof?: symbol; type?: unknown; prototype?: {isReactComponent?: unknown}};
        if (candidate.$$typeof === Symbol.for('react.memo')) {
            component = candidate.type;
            continue;
        }
        return Boolean(candidate.prototype?.isReactComponent || candidate.$$typeof === Symbol.for('react.forward_ref'));
    }
    return false;
}

/** Web adapter for SDK 0.1.0: reset a failed render boundary on the next render. */
export default class ComponentUtil {
    private static readonly pendingRenders = new WeakMap<HTMLElement, {cancel: () => void}>();
    private static readonly renderTokens = new WeakMap<HTMLElement, object>();

    public static unmount(container: HTMLElement | null | undefined): void {
        if (container) {
            this.renderTokens.delete(container);
            this.pendingRenders.get(container)?.cancel();
        }
        SharedComponentUtil.unmount(container);
    }

    /** Release after React's current commit, unless the container has been reused. */
    public static release(container: HTMLElement | null | undefined): void {
        if (!container) return;
        const token = this.renderTokens.get(container);
        if (!token) return;
        this.pendingRenders.get(container)?.cancel();
        queueMicrotask(() => {
            if (this.renderTokens.get(container) === token) this.unmount(container);
        });
    }

    public static async createAndRender<I, P = any>(container: HTMLElement, Template: ClassType<P, any, any>, props?: P): Promise<I | null> {
        if (!container) throw new Error('create react node failed, container is null');
        const acceptsRef = acceptsComponentRef(Template);
        const render = (componentProps: P, ref?: Ref<I>) => createElement(RenderErrorBoundary, {
            onError: () => {
                // The SDK waits for a ref callback for class and forwardRef components.
                if (typeof ref === 'function') ref(null);
                else if (ref) (ref as {current: I | null}).current = null;
            },
            children: createElement(HostComponentUIProvider, {
                children: createElement(Template, {...componentProps, ...(ref ? {ref} : {})}),
            }),
        });
        // A fresh wrapper resets the Web boundary while the SDK retains its root.
        const Wrapped = acceptsRef
            ? forwardRef<I, P>((componentProps, ref) => render(componentProps as P, ref))
            : (componentProps: P) => render(componentProps);
        this.pendingRenders.get(container)?.cancel();
        this.renderTokens.set(container, {});
        return new Promise<I | null>((resolve, reject) => {
            let settled = false;
            const pending = {cancel: () => finish(null)};
            const finish = (instance: I | null) => {
                if (settled) return;
                settled = true;
                if (this.pendingRenders.get(container) === pending) this.pendingRenders.delete(container);
                resolve(instance);
            };
            this.pendingRenders.set(container, pending);
            SharedComponentUtil.createAndRender<I, P>(container, Wrapped as ClassType<P, any, any>, props)
                .then(instance => finish(instance), error => {
                    if (settled) return;
                    settled = true;
                    if (this.pendingRenders.get(container) === pending) this.pendingRenders.delete(container);
                    reject(error);
                });
        });
    }
}
