/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import './ProjectHeaderActions.less';
import {useSyncExternalStore} from 'react';
import {Observer, observer} from 'mobx-react';
import {AfferentFour, EfferentFour, HardDiskOne, Keyboard, MemoryOne, MoreOne, Pic, PreviewOpen, Repair, Return, Send} from '@icon-park/react';
import {useEditorCommands} from '@/shared/designer/EditorCommandContext.ts';
import {useEditorProject} from '@/shared/designer/EditorProjectContext.ts';
import {useEditorWorkspace} from '@/shared/designer/EditorWorkspaceContext.ts';
import WorkspacePopover from '@/shared/components/toolbar/WorkspacePopover.tsx';

const ProjectHeaderActions = observer(({canEdit}: {canEdit(): boolean}) => {
    const commands = useEditorCommands();
    const project = useEditorProject();
    const workspace = useEditorWorkspace();
    const status = useSyncExternalStore(project.saveStatus.subscribe, project.saveStatus.read, project.saveStatus.read);
    const statusText = status.saveState === 'saving' ? '保存中' :
        status.saveState === 'saved' ? `已保存 ${status.latestSaveTime}` :
            status.saveState === 'failed' ? '保存失败 · 点击重试' : '项目已载入';

    const execute = (id:string, request:Promise<unknown>) => {
        void request.catch(error => {
            if (!(error instanceof DOMException && error.name === 'AbortError'))
                console.error(`执行编辑器命令失败：${id}`, error);
        });
    };
    const openDialog = (dialog:'project' | 'canvas' | 'theme' | 'global-filter' | 'release' | 'cover' | 'repair' | 'restore') => {
        if (canEdit()) execute('project.dialog', commands.execute('project.dialog', dialog));
    };

    return <div className="workspace-project-actions">
        <button type="button" className={`workspace-save-status workspace-save-${status.saveState}`} aria-label={statusText}
                title={`${statusText}${status.latestSaveTime ? ` · 最近保存 ${status.latestSaveTime}` : ''}`}
                onClick={() => canEdit() && status.saveState === 'failed' && void project.save()}>
            <span className="workspace-save-indicator" aria-hidden="true"/>{statusText}
        </button>
        <button type="button" className="workspace-icon-button workspace-action-preview" aria-label="预览项目" title="预览"
                onClick={() => { if (canEdit()) void project.openPreview(); }}>
            <PreviewOpen theme="outline" size={18}/><span>预览</span>
        </button>
        <button type="button" className="workspace-publish-button" aria-label="发布项目" title="发布"
                onClick={() => openDialog('release')}>
            <Send theme="outline" size={17}/><span>发布</span>
        </button>
        <WorkspacePopover label="更多项目操作" icon={<MoreOne theme="outline" size={18}/>} align="right" className="workspace-more-menu">
            {(close) => <Observer>{() => <>
                {workspace?.read()?.nested && <>
                    <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); if (canEdit()) workspace.leaveLoopContainer(); }}>
                        <Return theme="outline" size={17}/><span>返回主项目</span>
                    </button>
                    <div className="workspace-menu-separator"/>
                </>}
                <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); if (canEdit()) project.saveThrottled(); }}>
                    <HardDiskOne theme="outline" size={17}/><span>保存项目</span>
                </button>
                <div className="workspace-menu-separator"/>
                <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); if (canEdit()) project.importProject(); }}>
                    <AfferentFour theme="outline" size={17}/><span>导入项目</span>
                </button>
                <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); if (canEdit()) project.exportProject(); }}>
                    <EfferentFour theme="outline" size={17}/><span>导出项目</span>
                </button>
                <div className="workspace-menu-separator"/>
                <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); openDialog('repair'); }}>
                    <Repair theme="outline" size={17}/><span>画布修复</span>
                </button>
                <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); openDialog('restore'); }}>
                    <MemoryOne theme="outline" size={17}/><span>本地自动存储恢复</span>
                </button>
                <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); openDialog('cover'); }}>
                    <Pic theme="outline" size={17}/><span>设置封面快照</span>
                </button>
                {commands.has('shortcuts.help') && <button type="button" role="menuitem" className="workspace-menu-item"
                    onClick={() => { close(); if (canEdit()) execute('shortcuts.help', commands.execute('shortcuts.help')); }}>
                    <Keyboard theme="outline" size={17}/><span>快捷键说明</span>
                </button>}
                {commands.has('canvas.create-loop') && <>
                    <div className="workspace-menu-separator"/>
                    <button type="button" role="menuitem" className="workspace-menu-item"
                            onClick={() => { close(); if (canEdit()) execute('canvas.create-loop', commands.execute('canvas.create-loop')); }}><span>创建循环容器</span></button>
                </>}
                {commands.has('blueprint.open') && <button type="button" role="menuitem" className="workspace-menu-item"
                    onClick={() => { close(); if (canEdit()) execute('blueprint.open', commands.execute('blueprint.open')); }}><span>打开蓝图</span></button>}
            </>}</Observer>}
        </WorkspacePopover>
    </div>;
});

export default ProjectHeaderActions;
