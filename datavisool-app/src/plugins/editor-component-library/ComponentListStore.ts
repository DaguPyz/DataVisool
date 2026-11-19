/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";
import type {DesignerCatalogComponent} from '@datavisool/sdk/plugin/contracts/designerCatalog';

export class ComponentListStore {
    private accepting = true;
    private disposed = false;
    private readonly pauseCleanups = new Set<() => void>();

    constructor() {
        makeObservable(this, {
            categories: observable,
            subCategories: observable,
            search: observable,
            compInfoArr: observable.ref,
            setCategories: action,
            setSubCategories: action,
            setSearch: action,
            doInit: action
        })
    }

    /**
     * 组件基础信息数组。设计器左侧组件列表的展示过滤依赖于此数组。
     * 该数组会在设计器加载时进行初始化，后续不再修改。若其他。 场景或组件需要。 操作该数组的数据。 应该操作他的备份。 而不是直接操作该数组。
     */
    compInfoArr: readonly DesignerCatalogComponent[] = [];

    categories: string = "all";

    subCategories: string = "all";

    search: string = "";

    get isAccepting() { return this.accepting && !this.disposed; }

    registerPauseCleanup(cleanup: () => void) {
        if (this.disposed) {
            return () => undefined;
        }
        this.pauseCleanups.add(cleanup);
        if (!this.accepting) {
            try { cleanup(); } catch (error) { console.error('清理组件库拖拽失败', error); }
        }
        return () => { this.pauseCleanups.delete(cleanup); };
    }

    pause() {
        if (!this.isAccepting) return;
        this.accepting = false;
        for (const cleanup of [...this.pauseCleanups]) {
            try { cleanup(); } catch (error) { console.error('清理组件库拖拽失败', error); }
        }
    }

    resume() { if (!this.disposed) this.accepting = true; }

    dispose() {
        if (this.disposed) return;
        this.pause();
        this.disposed = true;
        this.pauseCleanups.clear();
    }

    setCategories = (categories: string) => { if (this.isAccepting) this.categories = categories; };

    setSubCategories = (subCategories: string) => { if (this.isAccepting) this.subCategories = subCategories; };

    setSearch = (search: string) => { if (this.isAccepting) this.search = search; };

    doInit = (components: readonly DesignerCatalogComponent[]) => {
        if (!this.isAccepting) return;
        this.compInfoArr = components.filter(({baseInfo}) => !['LoopContainer', 'group'].includes(baseInfo.compKey));
        this.search = "";
    }

}
