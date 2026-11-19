/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useState} from 'react';
import ThemeItem from "@/comps/common-component/theme-config/theme-item/ThemeItem";
import type {IThemeItem} from '@datavisool/sdk/types';

interface ThemeListProps {
    data: readonly IThemeItem[];
    onSelected?: (data: IThemeItem, index: number) => void;
    showOperator?: boolean;
    onDel?: (id: string, index: number) => boolean;
}

const ThemeList = ({data, onSelected, showOperator, onDel}: ThemeListProps) => {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const _onDel = (id: string, index: number) => {
        if (!onDel?.(id, index)) return;
        setActiveIndex(current => current === index ? null : current !== null && current > index ? current - 1 : current);
    }


    const _onSelected = (data: IThemeItem, index: number) => {
        onSelected && onSelected(data, index);
        setActiveIndex(current => current === index ? null : index);
    }

    return (
        <div className={'datavisool-theme-list'} style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 20
        }}>
            {data.map((theme, index) => <ThemeItem
                key={index} id={theme.id} selected={index === activeIndex} name={theme.name} colors={theme.colors}
                showOperator={showOperator} onDel={id => _onDel(id, index)} onSelected={item => _onSelected(item, index)}/>)
            }
        </div>
    );
};

export default ThemeList;
