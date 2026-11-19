/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useState, type ReactNode} from 'react';
import {observer} from 'mobx-react';
import type {EditorToolbarItem} from '@datavisool/sdk/plugin/contracts/editorShell';
import {useEditorWorkspace} from '@/shared/designer/EditorWorkspaceContext.ts';
import {useEditorProject} from '@/shared/designer/EditorProjectContext.ts';
import {useNavigate} from 'react-router-dom';
import WorkspaceToolbar from './WorkspaceToolbar.tsx';
import editorLogoMark from '@/images/datavisool-logo.webp';
import './DesignerHeader.less';

const DesignerHeader = observer(({items, actions}: {items: readonly EditorToolbarItem[]; actions?: ReactNode}) => {
    const title = useEditorWorkspace()?.readScene()?.name || '未命名项目';
    const {save} = useEditorProject();
    const navigate = useNavigate();
    const [logoSrc, setLogoSrc] = useState('/static/logo/logo.png');
    return <header className="designer-header" data-viewport-ui="">
        <div className="workspace-project-identity" title={title}>
            <img src={logoSrc} onError={() => setLogoSrc(editorLogoMark)} alt="品牌LOGO"/>
            <span className="workspace-project-name">{title}</span>
        </div>
        <WorkspaceToolbar items={items} onReturnHome={() => {
            void save().then(saved => { if (saved) navigate('/home'); });
        }}/>
        {actions}
    </header>;
});

export default DesignerHeader;
