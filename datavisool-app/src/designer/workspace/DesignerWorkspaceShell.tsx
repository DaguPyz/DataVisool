/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {ReactNode} from 'react';
import './DesignerWorkspaceShell.less';
import WorkspaceZoomControls from './toolbar/WorkspaceZoomControls.tsx';

interface DesignerWorkspaceShellProps {
    canvas: ReactNode;
    header: ReactNode;
    left: ReactNode;
    right: ReactNode;
    footer: ReactNode;
}

/** Main-editor-only floating shell. The canvas stays in its own world layer. */
const DesignerWorkspaceShell = ({canvas, header, left, right, footer}: DesignerWorkspaceShellProps) => (
    <div className="designer-workspace-shell">
        <main className="designer-workspace-canvas"><div className="designer-workspace-canvas-content">{canvas}</div></main>
        <div className="designer-workspace-header">{header}</div>
        {left}
        {right}
        <div className="designer-workspace-footer">
            {footer}
            <WorkspaceZoomControls/>
        </div>
    </div>
);

export default DesignerWorkspaceShell;
