/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ClassType, createElement} from "react";
import {createRoot} from "react-dom/client";
import type {Root} from "react-dom/client";
import RenderErrorBoundary from "./RenderErrorBoundary";

class ComponentUtil {

    private static readonly reactRootMap = new WeakMap<HTMLElement, Root>();
    private static renderAttempt = 0;

    private static getReactRoot(container: HTMLElement): Root {
        let root = ComponentUtil.reactRootMap.get(container);
        if (!root) {
            root = createRoot(container);
            ComponentUtil.reactRootMap.set(container, root);
        }
        return root;
    }

    public static unmount(container: HTMLElement | null | undefined): void {
        if (!container)
            return;
        const root = ComponentUtil.reactRootMap.get(container);
        if (!root)
            return;
        root.unmount();
        ComponentUtil.reactRootMap.delete(container);
    }

    /**
     * 创建并渲染组件
     * @param container 组件容器
     * @param Template 组件模板
     * @param props 组件props参数
     */
    public static async createAndRender<I, P = any>(container: HTMLElement, Template: ClassType<P, any, any>, props?: P): Promise<I | null> {
        if (!container)
            throw new Error("create react node failed, container is null");
        return new Promise<I | null>((resolve) => {
            let settled = false;
            const settle = (instance: I | null) => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(instance);
            };
            try {
                //只有类组件与包含了forwardRef、useImperativeHandle的函数式组件才会执行ref回调
                const noRef = !(Template.prototype && Template.prototype.isReactComponent)
                    && !(Template.$$typeof && Template.$$typeof === Symbol.for('react.forward_ref'));
                if (!noRef)
                    props = {ref: (instance: I) => settle(instance), ...props} as P;
                ComponentUtil.getReactRoot(container).render(
                    createElement(
                        RenderErrorBoundary,
                        {
                            renderAttempt: ++ComponentUtil.renderAttempt,
                            onError: (error) => {
                                console.error('create react node failed ', error);
                                settle(null);
                            },
                            children: createElement(Template, {...props}),
                        },
                    ),
                );
                //没有ref则直接resolve
                if (noRef)
                    settle(null);
            } catch (e: unknown) {
                console.error('create react node failed ', e)
                settle(null);
            }
        });
    }
}

export default ComponentUtil;
