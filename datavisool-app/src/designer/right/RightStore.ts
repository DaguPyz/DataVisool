/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, computed, makeObservable, observable} from "mobx";
import type {MenuInfo} from "@datavisool/sdk/core";
import statusListStore from "./status-list/StatusListStore.ts";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import {ColorFilter, SettingOne, Theme} from "@icon-park/react";
import {subscribeLocaleChange} from "@/i18n/miniI18n.ts";
import designerLeftStore, {nextPanelOpenOrder} from "@/designer/left/DesignerLeftStore.ts";

const NARROW_VIEWPORT_WIDTH = 959;

export const enforceNarrowPanelExclusivity = (viewportWidth: number) => {
    if (viewportWidth > NARROW_VIEWPORT_WIDTH || !designerLeftStore.panelOpen || !rightStore.panelOpen)
        return;
    if (designerLeftStore.panelOpenOrder > rightStore.panelOpenOrder)
        rightStore.setContentVisible(false, false);
    else
        designerLeftStore.closePanel(false);
};

/**
 * 激活元素
 */
export interface ActiveElem {
    //元素id
    id?: string;
    //元素类型
    type?: string;
}


/**
 * 设计器。右侧组件配置状态管理类
 */
class RightStore {
    constructor() {
        makeObservable(this, {
            activeElem: observable.ref,
            menus: observable,
            activeMenu: observable,
            panelOpen: observable,
            panelOpenOrder: observable,
            configRevision: observable,
            visible: computed,
            detailVisible: observable,
            setDetailVisible: action,
            setActiveMenu: action,
            setContentVisible: action,
            consumeMenuFocusRestore: action,
            activeConfig: action,
        })
        subscribeLocaleChange(() => {
            if (this.activeElem.id && this.activeElem.type)
                this.activeConfig(this.activeElem.id, this.activeElem.type);
        });
    }

    /**
     * 当前选中的组件
     */
    activeElem: ActiveElem = {};
    /**
     * 当前选中组件的操作菜单列表
     */
    menus: Array<MenuInfo> = [];
    /**
     * 当前选中组件的操作菜单列表中处于激活状态的菜单
     */
    activeMenu: string = '';
    /**
     * 右侧组件配置区域是否可见
     */
    panelOpen: boolean = false;
    panelOpenOrder: number = 0;

    /** Backward-compatible name used by history rollback code. */
    get visible() {
        return this.panelOpen;
    }

    /** Forces config editors with local state to remount when the selection changes. */
    configRevision = 0;

    private menuTriggerRefs = new Map<string, HTMLButtonElement>();
    private restoreMenuFocusAfterClose = true;

    detailVisible = true;

    setActiveMenu = (menu: string) => this.activeMenu = menu;

    setDetailVisible = (visible: boolean) => this.detailVisible = visible;

    setContentVisible = (visible: boolean, restoreFocus = true) => {
        this.restoreMenuFocusAfterClose = visible || restoreFocus;
        this.panelOpen = visible;
        if (visible)
            this.panelOpenOrder = nextPanelOpenOrder();
    };

    consumeMenuFocusRestore = () => {
        const restoreFocus = this.restoreMenuFocusAfterClose;
        this.restoreMenuFocusAfterClose = true;
        return restoreFocus;
    };

    setMenuTriggerRef = (menu: string, element: HTMLButtonElement | null) => {
        if (element)
            this.menuTriggerRefs.set(menu, element);
        else
            this.menuTriggerRefs.delete(menu);
    };

    focusActiveMenuTrigger = () => {
        const trigger = this.menuTriggerRefs.get(this.activeMenu) || this.menuTriggerRefs.values().next().value;
        trigger?.focus();
    };

    activeConfig = (id: string | null, type: string | null, source: 'canvas' | 'layer-list' = 'canvas') => {
        if (!id || !type) {
            //无效的激活，置为默认状态
            this.activeMenu = '';
            this.activeElem = {};
            this.menus = [];
            this.restoreMenuFocusAfterClose = false;
            this.panelOpen = false;
            return;
        }
        this.activeElem = {id, type};
        //更新菜单列表
        const baseMenu: MenuInfo = {icon: SettingOne, name: '基础', key: 'base'};
        const filterMenu: MenuInfo = {icon: ColorFilter, name: '滤镜', key: 'filter'};
        const themeMenu: MenuInfo = {icon: Theme, name: '主题', key: 'theme'};
        const rawMenus = DesignerLoader?.definitionMap[type]?.getMenuList() || [];
        const normalizedMenus = rawMenus.filter((menu) => !['base', 'filter', 'theme'].includes(menu.key));
        this.menus = [baseMenu, ...normalizedMenus, filterMenu, themeMenu];
        const hasStyleMenu = this.menus.some((menu) => menu.key === 'style');
        const activeMenuExists = this.menus.some((menu) => menu.key === this.activeMenu);
        if (type === 'group' || !hasStyleMenu)
            this.activeMenu = 'base';
        else if (!activeMenuExists)
            this.activeMenu = 'style';
        // Keep list interactions mounted while synchronizing the active component on narrow screens.
        const keepLayerListOpen = source === 'layer-list'
            && window.innerWidth <= NARROW_VIEWPORT_WIDTH
            && designerLeftStore.panelOpen
            && designerLeftStore.activeModule === 'layer-list';
        this.setContentVisible(!keepLayerListOpen, false);
        this.configRevision += 1;
        //重新计算状态列表
        statusListStore.init();
    }

    remountConfigDetailsPanel = () => {
        rightStore.setDetailVisible(false);
        const timer = setTimeout(() => {
            rightStore.setDetailVisible(true);
            clearTimeout(timer);
        }, 0)
    }
}

const rightStore = new RightStore();
export default rightStore;
