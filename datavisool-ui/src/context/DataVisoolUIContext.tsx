/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
/**
 * DataVisool UI 的共享配置入口，用 React Context 向组件子树提供国际化配置。
 *
 * 数据流：应用传入 locale / translate → DataVisoolUIProvider → DataVisoolUIContext → 消费组件。
 * 函数组件通过 useDataVisoolUI 读取配置，类组件可通过 static contextType 读取。
 * DatavisoolGUI、ControlGroup 等组件使用这里的翻译函数，也支持通过自身 props 覆盖它。
 *
 * 本文件只负责传递配置及通知消费者更新；语言选择、词典和翻译实现由应用提供，
 * 不依赖应用全局对象、存储或专用事件。未配置翻译时保留原文的逻辑由消费组件处理。
 */
import * as React from 'react';

/**
 * 应用提供的同步文本翻译函数。
 * @param text 待翻译的原始文本。
 * @returns 翻译后的文本；没有对应翻译时可返回原文。
 */
export type DataVisoolUITranslate = (text: string) => string;

/** 可在组件子树中共享的 DataVisool UI 配置，所有字段均可省略。 */
export interface DataVisoolUIConfig {
    /**
     * 当前语言标识，例如 zh-CN、en-US；此处不校验语言，也不设置默认语言。
     * 作为 Context 更新依赖，使语言切换时即使 translate 引用不变也能通知消费者。
     */
    locale?: string;
    /** 由应用实现的翻译函数；省略时由消费组件决定如何展示文本。 */
    translate?: DataVisoolUITranslate;
}

/** Context 暴露给消费者的值，与共享配置保持一致。 */
export type DataVisoolUIContextValue = DataVisoolUIConfig;

/** Provider 的属性：共享配置及需要使用这些配置的组件子树。 */
export interface DataVisoolUIProviderProps extends DataVisoolUIConfig {
    /** 由当前 Provider 提供配置的子节点。 */
    children?: React.ReactNode;
}

/**
 * 共享配置 Context；未处于任何 Provider 内的消费者读取到空对象。
 * 嵌套 Provider 时读取最近一层的完整配置，不会自动合并外层配置。
 */
export const DataVisoolUIContext = React.createContext<DataVisoolUIContextValue>({});
// 为 React DevTools 提供便于识别的 Context 名称。
DataVisoolUIContext.displayName = 'DataVisoolUIContext';

/**
 * 将应用的国际化配置提供给子树中的 DataVisool UI 组件。
 * 应用切换语言后需更新 locale 属性；Provider 本身不监听外部语言变化。
 *
 * @param props 当前语言、翻译函数及子节点。
 * @returns 包含配置 Provider 的组件子树。
 */
export function DataVisoolUIProvider({locale, translate, children}: DataVisoolUIProviderProps) {
    // 配置不变时复用 value 引用，避免因每次创建新对象而触发额外的 Context 通知。
    // locale 也参与依赖，确保翻译函数引用稳定时仍可响应语言切换。
    const value = React.useMemo<DataVisoolUIContextValue>(() => ({locale, translate}), [locale, translate]);

    return (
        <DataVisoolUIContext.Provider value={value}>
            {children}
        </DataVisoolUIContext.Provider>
    );
}

/**
 * 在函数组件或自定义 Hook 中读取最近一层 Provider 的配置，并订阅其变化。
 * @returns 共享配置；没有 Provider 时返回空对象，不会抛出缺少 Provider 的错误。
 */
export function useDataVisoolUI(): DataVisoolUIContextValue {
    return React.useContext(DataVisoolUIContext);
}

/** 翻译组件内置文案；无翻译函数时保留原文，变量在翻译后插入以支持不同语序。 */
export function useDataVisoolUITranslate(override?: DataVisoolUITranslate) {
    const {translate} = useDataVisoolUI();
    const resolvedTranslate = override ?? translate;

    return React.useCallback((message: string, values?: Record<string, string | number>): string => {
        const translated = resolvedTranslate?.(message) ?? message;
        if (!values)
            return translated;
        return translated.replace(/\{(\w+)\}/g, (token, key: string) => (
            Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token
        ));
    }, [resolvedTranslate]);
}
