/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerCatalog, DesignerCatalogCategory} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import './ComponentList.less';
import DesignerPanelHeader from '@/shared/components/panel-header/DesignerPanelHeader';
import type {ComponentListStore} from './ComponentListStore.ts';
import {observer} from "mobx-react";
import {ComponentType, lazy, Suspense, useEffect} from "react";
import {Loading} from "@datavisool/ui";
import {IIconProps} from "@icon-park/react/lib/runtime";
import {Components, Search} from "@icon-park/react";
import {subscribeLocaleChange, tx} from "@/i18n/miniI18n.ts";
import {Input} from "@datavisool/ui";

const CompList = lazy(() => import('./list/CompList'));

function ComponentCatalogInitializer({catalog, store}: {catalog: DesignerCatalog; store: ComponentListStore}) {
    useEffect(() => {
        const initialize = () => store.doInit(catalog.listComponents());
        initialize();
        const unsubscribe = subscribeLocaleChange(initialize);
        return unsubscribe;
    }, [catalog, store]);
    return null;
}

export const CategoryList = observer(({items, store}: {items: readonly DesignerCatalogCategory[]; store: ComponentListStore}) => {
    const {categories, setCategories, setSubCategories} = store;
    return (
        <>
            {
                items.map((item, index) => {
                    const {icon, name, key} = item;
                    const displayName = tx(name);
                    const Icon = (icon ?? Components) as ComponentType<IIconProps>;
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

export const SubCategoryList = observer(({items, store}: {items: readonly DesignerCatalogCategory[]; store: ComponentListStore}) => {
    const {categories, subCategories, setSubCategories} = store;
    return (
        <>
            {
                items.map((item, index) => {
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


export const ComponentList = ({canvas, catalog, onClose, store}: {
    canvas: EditorCanvasService;
    catalog: DesignerCatalog;
    store: ComponentListStore;
    onClose(): void;
}) => {
    const searchChart = (value: string) => {
        store.setSearch(value);
    };

    return <div className={'dl-component-list'}>
        <DesignerPanelHeader title="组件库" onClose={onClose}/>
        <div className="dl-cl-toolbar">
            <Input
                placeholder={tx('搜索组件')}
                inputSize="sm"
                allowClear
                prefix={<Search size={14} fill="currentColor"/>}
                suffix={<span className="dl-cl-search-kbd">⌘ F</span>}
                onChange={searchChart}
            />
            <div className={'main-categories'}><CategoryList items={catalog.listCategories()} store={store}/></div>
        </div>
        <div className={'dl-cl-body'}>
            <Suspense fallback={<Loading/>}>
                <ComponentCatalogInitializer catalog={catalog} store={store}/>
                <div className={'sub-categories'}><SubCategoryList items={catalog.listSubCategories()} store={store}/></div>
                <div className={'component-list'}><CompList canvas={canvas} catalog={catalog} store={store}/></div>
            </Suspense>
        </div>
    </div>;
}
