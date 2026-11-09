/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import designerLeftStore from "./DesignerLeftStore";
import './DesignerLeft.less';
import {ComponentType, useEffect, useRef} from "react";
import type {KeyboardEvent} from "react";
import LeftMenus from "./designer-left-menus/LeftMenus.tsx";
import {ComponentList} from "./compoent-lib/ComponentList.tsx";
import LayerList from "./layer-list/LayerList.tsx";
import SourceList from "./source-list/SourceList.tsx";
import GlobalVariableList from "./global-variable/GlobalVariableList.tsx";
import TemplateLib from "./template-lib/TemplateLib.tsx";
import SubProject from "./sub-project/SubProject.tsx";
import AiDrivenBar from "@/designer/ai-driven/AiDrivenBar.tsx";


const leftFuncMap: Record<string, ComponentType> = {
    'components': ComponentList,
    'layer-list': LayerList,
    'source-list': SourceList,
    'global-variable': GlobalVariableList,
    'template-lib': TemplateLib,
    'sub-project': SubProject

}

export const DesignerLeft = observer(() => {
    const {activeModule, panelOpen, closePanel, setDesignerLeftRef, aiDrivenVisible, setAiDrivenVisible} = designerLeftStore;
    const leftDomRef = useRef<HTMLDivElement>(null);
    const Component = leftFuncMap[activeModule];


    useEffect(() => {
        setDesignerLeftRef(leftDomRef.current);
    }, [setDesignerLeftRef]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape' || !panelOpen)
            return;
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [role="option"], [aria-haspopup="listbox"], .datavisool-select-panel, .datavisool-searchable-select-panel, .datavisool-dropdown-popup, [data-escape-boundary]'))
            return;
        event.preventDefault();
        event.stopPropagation();
        closePanel();
    };

    return (
        <>
            <div className={`designer-left ${panelOpen ? 'is-panel-open' : ''}`} ref={leftDomRef}
                 data-viewport-ui="" onKeyDown={handleKeyDown}>
                <LeftMenus/>
                {panelOpen && Component && <div className="designer-left-panel" data-workspace-occlusion="left" data-viewport-ui="">
                    <Component/>
                </div>}
            </div>
            <AiDrivenBar open={aiDrivenVisible} onClose={() => setAiDrivenVisible(false)}/>
        </>
    );
})

export default DesignerLeft;
