/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './ComponentList.less';
import DesignerPanelHeader from '../panel-header/DesignerPanelHeader';
import {componentCategorize, componentSubCategorize} from "./ComponentCategorize";
import componentListStore from "./ComponentListStore";
import {observer} from "mobx-react";
import {ComponentType, lazy, Suspense} from "react";
import {Loading} from "@datavisool/ui";
import {IIconProps} from "@icon-park/react/lib/runtime";
import {Search} from "@icon-park/react";
import {tx} from "@/i18n/miniI18n.ts";
import {Input} from "@datavisool/ui";

const CompList = lazy(() => import('./list/CompList'));

export const CategoryList = observer(() => {
    const {categories, setCategories, setSubCategories} = componentListStore;
    return (
        <>
            {
                componentCategorize.map((item, index) => {
                    const {icon, name, key} = item;
                    const displayName = tx(name);
                    const Icon = icon as ComponentType<IIconProps>;
                    return (
                        <button type="button" aria-label={displayName} aria-pressed={categories === key}
                                className={`clo-item ${categories === key ? "clo-item-active" : ""}`} onClick={() => {
                            setCategories(key);
                            setSubCategories('all');
                        }} title={displayName} key={index}>
                            <Icon theme="outline" strokeWidth={4}/>
                        </button>
                    )
                })
            }
        </>
    )
});

export const SubCategoryList = observer(() => {
    const {categories, subCategories, setSubCategories} = componentListStore;
    return (
        <>
            {
                componentSubCategorize.map((item, index) => {
                    const {name, key, parentKey} = item;
                    if (categories === 'all' || key === 'all' || parentKey === categories) {
                        return <button type="button" key={index} aria-pressed={subCategories === key}
                                    onClick={() => setSubCategories(key)}
                                    className={`clt-item ${subCategories === key ? " clt-item-active" : ""}`}>{tx(name)}</button>
                    } else
                        return null;
                })
            }
        </>
    )
});


export const ComponentList = () => {
    const searchChart = (value: string) => {
        componentListStore.setSearch?.(value);
    };

    return <div className={'dl-component-list'}>
        <DesignerPanelHeader title="组件库"/>
        <div className="dl-cl-toolbar">
            <Input
                placeholder={tx('搜索组件')}
                inputSize="sm"
                allowClear
                prefix={<Search size={14} fill="currentColor"/>}
                suffix={<span className="dl-cl-search-kbd">⌘ F</span>}
                onChange={searchChart}
            />
            <div className={'main-categories'}><CategoryList/></div>
        </div>
        <div className={'dl-cl-body'}>
            <Suspense fallback={<Loading/>}>
                <div className={'sub-categories'}><SubCategoryList/></div>
                <div className={'component-list'}><CompList/></div>
            </Suspense>
        </div>
    </div>;
}
