/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {AbstractDesignerDefinition, registerHostConfigPanels} from "@datavisool/sdk";
import {createBrowserRouter, RouterProvider, useNavigate, useParams} from "react-router-dom";
import style from './index.module.less';

// Standalone development has no designer host; custom style panels still work.
const HostPanelPreview = () => <p>该面板由宿主应用提供，请在设计器中预览。</p>;
registerHostConfigPanels({
    BaseInfo: HostPanelPreview,
    AnimationConfig: HostPanelPreview,
    ThemeConfig: HostPanelPreview,
    DataConfig: HostPanelPreview,
    FilterConfig: HostPanelPreview,
});

(function () {
    const definitionMap: Record<string, AbstractDesignerDefinition> = {};
    const componentInfoList = [];
    // @ts-ignore
    const glob = import.meta.glob('./components/**/*.ts', {eager: true}) as Record<string, any>;
    for (const key of Object.keys(glob)) {
        const Clazz = glob[key]?.default;
        // eslint-disable-next-line no-prototype-builtins
        if (Clazz && AbstractDesignerDefinition.isPrototypeOf(Clazz)) {
            const definition: AbstractDesignerDefinition = new Clazz();
            //获取组件的基础信息
            if (typeof definition.getBaseInfo === "function") {
                const componentInfo = definition.getBaseInfo();
                if (componentInfo?.compKey)
                    definitionMap[componentInfo.compKey] = definition;
                componentInfoList.push(componentInfo);
            }
        }
    }
    window.__DEFINITION_MAP__ = definitionMap;
    window.__COMPONENT_INFO_LIST__ = componentInfoList;
})();

const ComponentList = () => {
    if (!window.__COMPONENT_INFO_LIST__)
        return null;
    const navigate = useNavigate();
    const bgColorList = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(to right, #6a11cb 0%, #2575fc 100%)',
        'linear-gradient(to top, #505285 0%, #585e92 12%, #65689f 25%, #7474b0 37%, #7e7ebb 50%, #8389c7 62%, #9795d4 75%, #a2a1dc 87%, #b5aee4 100%)',
        'linear-gradient(-20deg, #6e45e2 0%, #88d3ce 100%)',
        'linear-gradient(-20deg, #2b5876 0%, #4e4376 100%)',
        'linear-gradient(60deg, #3d3393 0%, #2b76b9 37%, #2cacd1 65%, #35eb93 100%)',
    ]
    return (
        <div className={style['component-list']}>
            {
                window.__COMPONENT_INFO_LIST__.map((info: any) => {
                    return (
                        <div key={info.compKey}
                             style={{background: bgColorList[Math.floor(Math.random() * bgColorList.length)]}}
                             onClick={() => {
                                 window.__CURRENT_COMPONENT__ = info.compKey;
                                 navigate(`/component/${info.compKey}`);
                             }}
                             className={style['component-item']}>
                            <div className={style['component-item-content']}>
                                {info.compName}</div>
                        </div>
                    )
                })
            }
        </div>
    )
}

const ComponentView = () => {
    const {componentKey} = useParams();
    const containerRef = useRef<any>();
    const controllerRef = useRef<any>();
    if (!componentKey)
        return null;
    const definition = window.__DEFINITION_MAP__[componentKey];
    if (!definition)
        return null;
    const [activeMenu, setActiveMenu] = useState<string>();
    const menuList = definition?.getMenuList() ?? [];
    const {width, height} = definition.getBaseInfo();
    const menuToConfig = definition.getMenuToConfigContentMap();
    const ConfigComponent = menuToConfig[activeMenu ?? ''];


    useEffect(() => {
        const Controller = definition.getController();
        if (!Controller)
            return;
        const controllerInstance = new Controller() as any;
        controllerInstance.create(containerRef.current, definition.getInitConfig(), null as any).then(() => {
            controllerInstance.registerEvent();
        })
        controllerRef.current = controllerInstance;
        return () => controllerInstance.destroy();
    }, []);


    return (
        <div className={style['main-canvas']}>
            <div className={style["canvas-left"]}>
                <div style={{width, height}} ref={containerRef}></div>
            </div>
            <div className={style["canvas-right"]}>
                <div className={style["config-menus"]}>
                    {
                        menuList.map((menu: any) => {
                            return (
                                <div key={menu.key}
                                     onClick={() => setActiveMenu(menu.key)}
                                     className={`${style['config-menu-item']} ${activeMenu === menu.key ? style['menu-active'] : ''}`}>
                                    {menu.name}
                                </div>
                            )
                        })
                    }
                </div>
                <div className={style["config-content"]}>
                    {ConfigComponent && <ConfigComponent controller={controllerRef.current}/>}
                </div>
            </div>
        </div>
    )
}


createRoot(document.getElementById('root')!).render(
    <RouterProvider router={createBrowserRouter([
        {
            path: '/',
            element: <ComponentList/>
        },
        {
            path: '/component/:componentKey',
            element: <ComponentView/>
        }
    ])}/>
);
