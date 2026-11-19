/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import {useDesignerDock} from "./DesignerDockContext.ts";
import './DesignerLeft.less';
import {Suspense} from "react";
import type {KeyboardEvent} from "react";
import LeftMenus from "./LeftMenus.tsx";


import type {EditorAssistantPanel, EditorDockPanel} from '@datavisool/sdk/plugin/contracts/editorShell';

export const DesignerLeft = observer(({panels, assistant}: {
    panels: readonly EditorDockPanel[];
    assistant?: EditorAssistantPanel;
}) => {
    const {activeModule, panelOpen, closePanel, aiDrivenVisible, setAiDrivenVisible} = useDesignerDock();
    const Panel = panels.find(panel => panel.id === activeModule)?.Panel;


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
            <div className={`designer-left ${panelOpen ? 'is-panel-open' : ''}`}
                 data-viewport-ui="" onKeyDown={handleKeyDown}>
                <LeftMenus panels={panels} assistant={assistant}/>
                {panelOpen && Panel && <div className="designer-left-panel" data-workspace-occlusion="left" data-viewport-ui="">
                    <Suspense><Panel onClose={() => closePanel()}/></Suspense>
                </div>}
            </div>
            {assistant && <Suspense><assistant.Panel open={aiDrivenVisible} onClose={() => setAiDrivenVisible(false)}/></Suspense>}
        </>
    );
})

export default DesignerLeft;
