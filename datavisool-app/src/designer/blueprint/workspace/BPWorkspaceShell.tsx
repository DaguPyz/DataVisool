/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {observer} from 'mobx-react';
import bpWorkspaceUIStore from './BPWorkspaceUIStore';
import {useBPPortalTheme} from './useBPPortalTheme';
import './BPWorkspaceTokens.less';
import './BPWorkspaceShell.less';

interface BPWorkspaceShellProps {
    canvas: ReactNode;
    header: ReactNode;
    left: ReactNode;
    right: ReactNode;
    footer: ReactNode;
}

const BPWorkspaceShell = observer(({canvas, header, left, right, footer}: BPWorkspaceShellProps) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const {leftOpen, rightOpen, activeNarrowPanel, rightWidth, nodeDragActive} = bpWorkspaceUIStore;
    const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 959px)').matches);

    useLayoutEffect(() => {
        bpWorkspaceUIStore.resetPanelState();
        const media = window.matchMedia('(max-width: 959px)');
        const handleChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
        setIsNarrow(media.matches);
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);
    useBPPortalTheme(rootRef);

    const leftPanelCollapsed = isNarrow && rightOpen && activeNarrowPanel === 'right' && !nodeDragActive;
    const rightPanelCollapsed = isNarrow && leftOpen && activeNarrowPanel === 'left';

    return (
        <div className="bp-workspace-shell blueprint-workspace-root"
             ref={rootRef}
             data-narrow-panel={activeNarrowPanel}
             data-left-open={leftOpen}
             data-right-open={rightOpen}
             style={{'--bp-config-width': `${rightWidth}px`} as CSSProperties}>
            <main className="bp-workspace-canvas">{canvas}</main>
            <div className="bp-workspace-header" data-bp-ui>{header}</div>
            <div className={`bp-workspace-left${leftPanelCollapsed ? ' bp-workspace-left--narrow-collapsed' : ''}`}
                 data-bp-ui>
                {left}
            </div>
            <div className={`bp-workspace-right${!rightOpen || rightPanelCollapsed ? ' bp-workspace-right--hidden' : ''}`}
                 data-bp-ui
                 aria-hidden={!rightOpen || rightPanelCollapsed}>
                {right}
            </div>
            <div className="bp-workspace-footer" data-bp-ui>{footer}</div>
        </div>
    );
});

export default BPWorkspaceShell;
