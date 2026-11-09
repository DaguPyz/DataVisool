/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";

class BPLeftStore {
    constructor() {
        makeObservable(this, {
            activeMenu: observable,
            setActiveMenu: action,
            usedNodes: observable,
            setUsedNodes: action,
            resetUsedNodes: action,
            searchValue: observable,
            setSearchValue: action,
        })
    }

    activeMenu = 'layer';

    /**
     * 已使用的节点（类似图层节点、全局变量节点只有一份。不可重复拖拽使用）
     */
    usedNodes: Record<string, boolean> = {};

    searchValue = '';

    setSearchValue = (value: string) => this.searchValue = value;

    setActiveMenu = (menu: string) => this.activeMenu = menu;

    setUsedNodes = (node: string, used: boolean) => this.usedNodes[node] = used;

    resetUsedNodes = () => this.usedNodes = {};

}

const bpLeftStore = new BPLeftStore();
export default bpLeftStore;
