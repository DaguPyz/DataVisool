/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useState} from 'react';
import ThemeItem from "@/comps/common-component/theme-config/theme-item/ThemeItem";
import {observer} from "mobx-react";
import {IThemeItem, ThemeColors} from "@datavisool/sdk/types";

interface ThemeListProps {
    data?: IThemeItem[];
    onSelected?: (data: IThemeItem, index: number) => void;
    showOperator?: boolean;
    onDel?: (id: string, index: number) => void;
}

const ThemeList = observer((props: ThemeListProps) => {
    const {onSelected, showOperator, onDel} = props;
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const _onDel = (id: string, index: number) => {
        const {themeConfig, updateThemeConfig} = window.DATAVISOOL_ENV.currentManager.themeManager!;
        const newThemes = themeConfig!.filter((_, i) => i !== index);
        updateThemeConfig(newThemes);
        setActiveIndex(current => current === index ? null : current !== null && current > index ? current - 1 : current);
        onDel && onDel(id, index);
    }


    const _onSelected = (data: IThemeItem, index: number) => {
        onSelected && onSelected(data, index);
        setActiveIndex(current => current === index ? null : index);
    }

    const {themeConfig} = window.DATAVISOOL_ENV.currentManager.themeManager!;
    const themeList = [];
    for (let i = 0; i < themeConfig!.length; i++) {
        themeList.push(<ThemeItem key={i} id={themeConfig![i].id} selected={i === activeIndex}
                                  name={themeConfig![i].name}
                                  showOperator={showOperator}
                                  onDel={(id) => _onDel(id, i)}
                                  onSelected={(data) => _onSelected(data, i)}
                                  colors={themeConfig![i].colors as ThemeColors}/>)
    }
    return (
        <div className={'datavisool-theme-list'} style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 20
        }}>
            {themeList}
        </div>
    );
});

export default ThemeList;
