/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Fragment, Suspense} from 'react';
import {DashboardOne} from '@icon-park/react';
import type {EditorToolbarItem} from '@datavisool/sdk/plugin/contracts/editorShell';
import useToolbarMagnification from '@/shared/components/toolbar/useToolbarMagnification.ts';
import '@/shared/components/toolbar/WorkspaceControls.less';
import './WorkspaceToolbar.less';

export default function WorkspaceToolbar({items, onReturnHome}: {items: readonly EditorToolbarItem[]; onReturnHome(): void}) {
    const toolbarRef = useToolbarMagnification();
    const groups = new Map<string, {items: EditorToolbarItem[]; className?: string; divider?: string}>();
    for (const item of items) {
        let group = groups.get(item.group);
        if (!group) {
            group = {items: [], className: item.groupClassName, divider: item.dividerClassName};
            groups.set(item.group, group);
        }
        group.items.push(item);
    }
    return <div ref={toolbarRef} className="workspace-toolbar-container" data-toolbar-magnification="">
        <div className="workspace-home-control">
            <button type="button" className="workspace-icon-button" aria-label="返回首页" title="返回首页"
                    onClick={onReturnHome}><DashboardOne theme="outline" size={19}/></button>
        </div>
        <div className="workspace-toolbar" role="toolbar" aria-label="画布工具" data-workspace-toolbar="">
            {[...groups].map(([id, group], index) => <Fragment key={id}>
                {index > 0 && <span className={`workspace-toolbar-divider ${group.divider ?? ''}`} aria-hidden="true"/>}
                <div className={`workspace-toolbar-group ${group.className ?? ''}`}>
                    {group.items.map(({id, View}) => <Suspense key={id}><View/></Suspense>)}
                </div>
            </Fragment>)}
        </div>
    </div>;
}
