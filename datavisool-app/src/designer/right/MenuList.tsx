/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {ComponentType, MouseEvent} from 'react';
import type {MenuInfo} from "@datavisool/sdk/core";
import rightStore from "./RightStore";
import {observer} from "mobx-react";
import {Info} from "@icon-park/react";
import {IIconProps} from "@icon-park/react/lib/runtime";
import {tx} from "@/i18n/miniI18n.ts";
import useToolbarMagnification from "@/designer/workspace/toolbar/useToolbarMagnification.ts";

const MenuList = observer(() => {
    const toolbarRef = useToolbarMagnification('y', '.menu-item');

    const menuChange = (e: MouseEvent<HTMLButtonElement>) => {
        const {setActiveMenu, setContentVisible} = rightStore;
        setActiveMenu && setActiveMenu((e.currentTarget as HTMLElement).id);
        setContentVisible && setContentVisible(true);
    }

    const buildMenuList = () => {
        const {menus, activeMenu, panelOpen} = rightStore;
        if (menus.length === 0)
            return <div
                style={{
                    writingMode: 'vertical-rl',
                    color: '#A0A0B2',
                    letterSpacing: '4px',
                    padding: 12,
                    fontSize: 12,
                    lineHeight: '16px',
                    fontFamily: 'Inter, Helvetica Neue, Roboto, sans-serif'
                }}><Info theme={"filled"} style={{fontSize: 16, marginBottom: 8, color: '#A0A0B2'}}/>{tx('双击组件激活...')}
            </div>
        return menus.map((item: MenuInfo) => {
            const Icon = item.icon as ComponentType<IIconProps>;
            const expanded = panelOpen && activeMenu === item.key;
            return (
                <button type="button" className={`menu-item ${expanded ? "menu-item-active" : ""}`} key={item.key}
                     ref={(element) => rightStore.setMenuTriggerRef(item.key, element)}
                     id={item.key} aria-label={tx(item.name)} aria-expanded={expanded}
                     aria-controls="datavisool-config-panel" title={tx(item.name)} onClick={menuChange}>
                    <div className={'item-icon'}>
                        {Icon && <Icon theme="outline" size="18" />}
                    </div>
                    <div className={'item-content'}>{tx(item.name)}</div>
                </button>
            );
        });
    }

    return (
        <div ref={toolbarRef} className={'datavisool-config-menu'} data-toolbar-magnification="">
            <div className={'menu-list'}>
                {buildMenuList()}
            </div>
        </div>
    );
});

export default MenuList;
