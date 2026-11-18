/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';

export interface TabsItem {
    key: string;
    label: React.ReactNode;
    children?: React.ReactNode;
    disabled?: boolean;
}

export interface TabsProps {
    items?: TabsItem[];
    activeKey?: string;
    defaultActiveKey?: string;
    onChange?: (activeKey: string) => void;
    className?: string;
    tabBarClassName?: string;
    contentClassName?: string;
    style?: React.CSSProperties;
}

export function Tabs(props: TabsProps) {
    const {
        items = [],
        activeKey,
        defaultActiveKey,
        onChange,
        className,
        tabBarClassName,
        contentClassName,
        style,
    } = props;
    const controlled = activeKey !== undefined;
    const [innerActiveKey, setInnerActiveKey] = React.useState(defaultActiveKey ?? items[0]?.key);
    const finalActiveKey = controlled ? activeKey : innerActiveKey;
    const activeItem = items.find((item) => item.key === finalActiveKey) ?? items[0];

    const updateActiveKey = (nextKey: string) => {
        if (!controlled)
            setInnerActiveKey(nextKey);
        onChange?.(nextKey);
    };

    return (
        <div className={cn('datavisool-tabs', className)} style={style}>
            <div className={cn('datavisool-tabs-nav', tabBarClassName)} role="tablist">
                {items.map((item) => {
                    const active = item.key === activeItem?.key;

                    return (
                        <button
                            key={item.key}
                            type="button"
                            className={cn('datavisool-tabs-tab', active && 'datavisool-tabs-tab-active')}
                            role="tab"
                            aria-selected={active}
                            disabled={item.disabled}
                            onClick={() => {
                                if (!item.disabled)
                                    updateActiveKey(item.key);
                            }}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
            <div className={cn('datavisool-tabs-content', contentClassName)} role="tabpanel">
                {activeItem?.children}
            </div>
        </div>
    );
}
