/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export default class DomUtil {
    /**
     * 判断目标元素在目标容器内是否肉眼可见。
     * @param el 目标元素
     * @param container 目标容器
     */
    public static isViewInContainer(el: Element, container: Element): boolean {
        if (!el || !container)
            return true;
        const containerRect = container.getBoundingClientRect();
        const elementRect = el.getBoundingClientRect();

        return (
            elementRect.top >= containerRect.top &&
            elementRect.left >= containerRect.left &&
            elementRect.bottom <= containerRect.bottom &&
            elementRect.right <= containerRect.right
        );
    }

    /**
     * 计算目标元素与目标容器的距离
     * @param el 目标元素
     * @param container 目标容器
     */
    public static calculatesDistanceFromContainer(el: Element, container: Element): number {
        if (!el || !container)
            return NaN;
        const containerRect = container.getBoundingClientRect();
        const elementRect = el.getBoundingClientRect();
        return elementRect.top - containerRect.top;
    }

    /**
     * 更新dom元素样式
     */
    public static updateDomStyle(target: HTMLElement, style: Record<string, string>) {
        if (!style || !target)
            return;
        for (const key in style) {
            const value = style[key];
            if (!value)
                continue;
            if (key.includes("-"))
                target.style.setProperty(key, value as string);
            else
                (target.style as any)[key] = value as string;
        }
    }
}
