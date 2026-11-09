/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import MenuList from "./MenuList";
import ConfigContent from "./ConfigContent";
import rightStore from "./RightStore";
import {observer} from "mobx-react";
import './DesignerRight.less';
import designerLeftStore from "@/designer/left/DesignerLeftStore";
import {enforceNarrowPanelExclusivity} from "./RightStore";
import {useEffect, useRef} from "react";
import type {KeyboardEvent} from "react";

const DesignerRight = observer(() => {
    const {activeElem, panelOpen, configRevision, focusActiveMenuTrigger, consumeMenuFocusRestore} = rightStore;
    const {panelOpen: leftPanelOpen, panelOpenOrder: leftPanelOpenOrder} = designerLeftStore;
    const {panelOpenOrder: rightPanelOpenOrder} = rightStore;
    const wasPanelOpenRef = useRef(panelOpen);

    useEffect(() => {
        const enforceCurrentViewport = () => enforceNarrowPanelExclusivity(window.innerWidth);
        enforceCurrentViewport();
        window.addEventListener('resize', enforceCurrentViewport);
        return () => window.removeEventListener('resize', enforceCurrentViewport);
    }, [leftPanelOpen, leftPanelOpenOrder, panelOpen, rightPanelOpenOrder]);

    useEffect(() => {
        if (wasPanelOpenRef.current && !panelOpen && consumeMenuFocusRestore()) {
            const focus = () => {
                if (!rightStore.panelOpen)
                    focusActiveMenuTrigger();
            };
            if (typeof window.requestAnimationFrame === 'function')
                window.requestAnimationFrame(focus);
            else
                window.setTimeout(focus, 0);
        }
        wasPanelOpenRef.current = panelOpen;
    }, [consumeMenuFocusRestore, focusActiveMenuTrigger, panelOpen]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape' || !panelOpen)
            return;
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [role="option"], [aria-haspopup="listbox"], .datavisool-select-panel, .datavisool-searchable-select-panel, .datavisool-dropdown-popup, [data-escape-boundary]'))
            return;
        event.preventDefault();
        event.stopPropagation();
        rightStore.setContentVisible(false);
    };

    return (
        <div className="designer-right" data-viewport-ui="" onKeyDown={handleKeyDown}>
            {activeElem.id && <>
                {panelOpen && <ConfigContent key={configRevision}/>}
                <MenuList/>
            </>}
        </div>
    );
})

export default DesignerRight;
