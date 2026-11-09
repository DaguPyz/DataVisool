/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import './LeftMenus.less';
import designerLeftStore, {ILeftMenu} from "@/designer/left/DesignerLeftStore";
import {Box, Brain, CodeBrackets, Components, FolderClose, Layers, PageTemplate} from "@icon-park/react";
import {useEffect, useRef} from "react";
import useToolbarMagnification from "@/designer/workspace/toolbar/useToolbarMagnification.ts";

const LeftMenus = observer(() => {
    const toolbarRef = useToolbarMagnification('y', '.menu-item, .ai-driven-button');
    const {activeModule, panelOpen, aiDrivenVisible, setAiDrivenVisible, toggleAiDrivenVisible, consumeDockFocusRestore} = designerLeftStore;
    const dockButtonsRef = useRef(new Map<string, HTMLButtonElement>());
    const wasPanelOpenRef = useRef(panelOpen);

    useEffect(() => {
        if (wasPanelOpenRef.current && !panelOpen && consumeDockFocusRestore()) {
            const focus = () => {
                if (!designerLeftStore.panelOpen)
                    dockButtonsRef.current.get(activeModule)?.focus();
            };
            if (typeof window.requestAnimationFrame === 'function')
                window.requestAnimationFrame(focus);
            else
                window.setTimeout(focus, 0);
        }
        wasPanelOpenRef.current = panelOpen;
    }, [activeModule, consumeDockFocusRestore, panelOpen]);

    const menus: Array<ILeftMenu> = [
        {
            icon: <Components theme="outline" size={20}/>,
            name: "组件库",
            key: 'components',
        },
        {
            icon: <Box theme="outline" size={20}/>,
            name: "资源库",
            key: 'source-list',
        },
        {
            icon: <Layers theme="outline" size={20}/>,
            name: "图层",
            key: 'layer-list',
        },
        {
            icon: <PageTemplate theme="outline" size={20}/>,
            name: "模板库",
            key: 'template-lib',
        },
        {
            icon: <CodeBrackets theme="outline" size={20}/>,
            name: "全局变量",
            key: 'global-variable',
        },
        {
            icon: <FolderClose theme="outline" size={20}/>,
            name: '子项目',
            key: 'sub-project'
        },
    ];

    const changeMenu = (menu: string) => {
        if (!menu || menu === '')
            return;
        if (aiDrivenVisible) {
            closeAiDrivenInput();
        }
        designerLeftStore.togglePanel(menu);
    }

    const closeAiDrivenInput = () => {
        setAiDrivenVisible(false);
    };

    const handleAiDriven = () => {
        toggleAiDrivenVisible();
    };

    const buildClassifyList = () => {
        const classifyArr = [];
        for (let i = 0; i < menus.length; i++) {
            const {icon: Icon, name, key} = menus[i];
            const expanded = panelOpen && key === activeModule;
            classifyArr.push(
                <button type="button" key={i + ''} ref={(element) => {
                    if (element)
                        dockButtonsRef.current.set(key, element);
                    else
                        dockButtonsRef.current.delete(key);
                }} className={`menu-item ${expanded ? "menu-item-active" : ""}`}
                     aria-label={name} aria-expanded={expanded}
                     title={name} onClick={() => changeMenu(key)}>
                    <div className={'menu-item-icon'}>{Icon}</div>
                    <span className={'menu-item-content'} title={name}>{name}</span>
                </button>
            )
        }
        return classifyArr;
    }

    return (
        <div ref={toolbarRef} className={'designer-left-menus'} data-viewport-ui="" data-toolbar-magnification="">
            <div className={'designer-left-menus-top'}>
                {buildClassifyList()}
            </div>
            <div className={'designer-left-menus-bottom'}>
                <button
                    type="button"
                    className={`ai-driven-button ${aiDrivenVisible ? "ai-driven-button-active" : ""}`}
                    onClick={handleAiDriven}
                    title="AI驱动（Ctrl + Alt + A / Command + Option + A）"
                    aria-label="AI驱动" aria-expanded={aiDrivenVisible}
                >
                    <Brain theme="outline" size={20}/>
                    <span className="ai-driven-button-label">AI驱动</span>
                </button>
            </div>
        </div>
    );
})

export default LeftMenus;
