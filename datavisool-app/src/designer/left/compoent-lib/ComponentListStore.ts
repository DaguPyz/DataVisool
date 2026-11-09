/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";
import {BaseInfoType} from "@datavisool/sdk/types";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import {subscribeLocaleChange} from "@/i18n/miniI18n.ts";

class ComponentListStore {
    constructor() {
        makeObservable(this, {
            categories: observable,
            subCategories: observable,
            search: observable,
            compInfoArr: observable,
            setCategories: action,
            setSubCategories: action,
            setSearch: action,
            doInit: action
        })
        subscribeLocaleChange(() => this.doInit());
    }

    /**
     * 组件基础信息数组。设计器左侧组件列表的展示过滤依赖于此数组。
     * 该数组会在设计器加载时进行初始化，后续不再修改。若其他。 场景或组件需要。 操作该数组的数据。 应该操作他的备份。 而不是直接操作该数组。
     */
    compInfoArr: Array<BaseInfoType> = [];

    categories: string = "all";

    subCategories: string = "all";

    search: string = "";

    setCategories = (categories: string) => this.categories = categories;

    setSubCategories = (subCategories: string) => this.subCategories = subCategories;

    setSearch = (search: string) => this.search = search;

    doInit = () => {
        const comps: Array<BaseInfoType> = [];
        if (DesignerLoader.definitionMap) {
            Object.keys(DesignerLoader.definitionMap).forEach(key => {
                const baseInfo = DesignerLoader.definitionMap[key].getBaseInfo();
                if (!['LoopContainer', 'group'].includes(baseInfo.compKey))
                    comps.push(baseInfo);
            });
        }
        this.compInfoArr = comps;
        this.search = "";
    }

}

const componentListStore = new ComponentListStore();
export default componentListStore;
