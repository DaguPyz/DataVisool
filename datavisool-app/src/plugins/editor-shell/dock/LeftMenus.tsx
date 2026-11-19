/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import './LeftMenus.less';
import {useDesignerDock} from "./DesignerDockContext.ts";
import type {EditorAssistantPanel, EditorDockPanel} from '@datavisool/sdk/plugin/contracts/editorShell';
import {useEffect, useRef} from "react";
import useToolbarMagnification from "@/shared/components/toolbar/useToolbarMagnification.ts";

const LeftMenus = observer(({panels, assistant}: {panels: readonly EditorDockPanel[]; assistant?: EditorAssistantPanel}) => {
    const designerLeftStore = useDesignerDock();
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
            wasPanelOpenRef.current = panelOpen;
            if (typeof window.requestAnimationFrame === 'function') {
                const frame = window.requestAnimationFrame(focus);
                return () => window.cancelAnimationFrame(frame);
            }
            const timer = window.setTimeout(focus, 0);
            return () => window.clearTimeout(timer);
        }
        wasPanelOpenRef.current = panelOpen;
    }, [activeModule, consumeDockFocusRestore, panelOpen, designerLeftStore]);

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
        for (let i = 0; i < panels.length; i++) {
            const {icon, label: name, id: key} = panels[i];
            const expanded = panelOpen && key === activeModule;
            classifyArr.push(
                <button type="button" key={key} ref={(element) => {
                    if (element)
                        dockButtonsRef.current.set(key, element);
                    else
                        dockButtonsRef.current.delete(key);
                }} className={`menu-item ${expanded ? "menu-item-active" : ""}`}
                     aria-label={name} aria-expanded={expanded}
                     title={name} onClick={() => changeMenu(key)}>
                    <div className={'menu-item-icon'}>{icon}</div>
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
            {assistant && <div className={'designer-left-menus-bottom'}>
                <button
                    type="button"
                    className={`ai-driven-button ${aiDrivenVisible ? "ai-driven-button-active" : ""}`}
                    onClick={handleAiDriven}
                    title={assistant.title}
                    aria-label={assistant.label} aria-expanded={aiDrivenVisible}
                >
                    {assistant.icon}
                    <span className="ai-driven-button-label">{assistant.label}</span>
                </button>
            </div>}
        </div>
    );
})

export default LeftMenus;
