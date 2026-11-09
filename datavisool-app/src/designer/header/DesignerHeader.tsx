/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from 'mobx-react';
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {AfferentFour, EfferentFour, HardDiskOne, Keyboard, MemoryOne, MoreOne, Pic, PreviewOpen, Repair, Return, Send} from '@icon-park/react';
import {isTauriRuntime, openDesktopWebview} from '@/util/TauriCompatUtil.ts';
import {withDesktopWebviewUserAgent} from '@/util/WebviewUserAgentUtil.ts';
import {createLoopContainer, doSave, exportProject, importProject, returnPrevProject, throttleSave} from '@/designer/operate-provider/hot-key/HotKeyImpl';
import eventOperateStore from '@/designer/operate-provider/EventOperateStore';
import designerHeaderStore from './DesignerHeaderStore.ts';
import managerStore from '@/designer/manager/ManagerStore.ts';
import {DesignerScene} from '@datavisool/sdk/types';
import footerStore from '@/designer/footer/FooterStore.ts';
import ProjectHdItemImpl from './items/project/ProjectHdItemImpl.tsx';
import CanvasHdConfigImpl from './items/canvas/CanvasHdConfigImpl.tsx';
import ThemeHdItemImpl from './items/theme/ThemeHdItemImpl.tsx';
import BluePrintHdImpl from './items/blue-print/BluePrintHdImpl.tsx';
import ReleaseHdConfigImpl from './items/release/ReleaseHdConfigImpl.tsx';
import GlobalFilterConfigImpl from './items/global-filter/GlobalFilterConfigImpl.tsx';
import WorkspacePopover from '@/designer/workspace/toolbar/WorkspacePopover.tsx';
import WorkspaceToolbar from '@/designer/workspace/toolbar/WorkspaceToolbar.tsx';
import editorLogoMark from '@/images/datavisool-logo.webp';
import './DesignerHeader.less';

const Header = observer(() => {
    const navigate = useNavigate();
    const [logoSrc, setLogoSrc] = useState('/static/logo/logo.png');
    const currentManager = managerStore.currentManager;
    const title = currentManager?.name || '未命名项目';
    const statusText = footerStore.saveState === 'saving' ? '保存中' :
        footerStore.saveState === 'saved' ? `已保存 ${footerStore.latestSaveTime}` :
            footerStore.saveState === 'failed' ? '保存失败 · 点击重试' : '项目已载入';

    const openPreview = async () => {
        const id = managerStore.currentFinalManager?.id;
        if (!id) return;
        const isTauri = isTauriRuntime();
        // Reserve the browser window while the click still has user activation.
        const previewWindow = isTauri ? null : window.open('about:blank', '_blank');
        const saved = await doSave();
        if (!saved) {
            previewWindow?.close();
            return;
        }
        if (isTauri) {
            void openDesktopWebview(`preview-${id}`, withDesktopWebviewUserAgent({
                url: `/preview?id=${id}`,
                title: 'DataVisool Preview',
                decorations: false,
                width: 1280,
                height: 800,
            }));
        } else if (previewWindow && !previewWindow.closed) {
            previewWindow.location.replace(`/preview?id=${id}`);
        }
    };

    const openBlueprint = () => {
        eventOperateStore.setTargetIds([]);
        designerHeaderStore.setCurrentKey('blue-print');
    };

    const setDialog = (key: string) => designerHeaderStore.setCurrentKey(key);

    return (
        <>
            <header className="designer-header" data-viewport-ui="">
                <div className="workspace-project-identity" title={title}>
                    <img src={logoSrc} onError={() => setLogoSrc(editorLogoMark)} alt="品牌LOGO"/>
                    <span className="workspace-project-name">{title}</span>
                </div>

                <WorkspaceToolbar onReturnHome={() => { void doSave().then((saved) => { if (saved) navigate('/home'); }); }}/>

                <div className="workspace-project-actions">
                    <button type="button" className={`workspace-save-status workspace-save-${footerStore.saveState}`} aria-label={statusText}
                            title={`${statusText}${footerStore.latestSaveTime ? ` · 最近保存 ${footerStore.latestSaveTime}` : ''}`}
                            onClick={() => footerStore.saveState === 'failed' && doSave()}>
                        <span className="workspace-save-indicator" aria-hidden="true"/>{statusText}
                    </button>
                    <button type="button" className="workspace-icon-button workspace-action-preview" aria-label="预览项目" title="预览"
                            onClick={() => openPreview()}><PreviewOpen theme="outline" size={18}/><span>预览</span></button>
                    <button type="button" className="workspace-publish-button" aria-label="发布项目" title="发布"
                            onClick={() => setDialog('release')}><Send theme="outline" size={17}/><span>发布</span></button>
                    <WorkspacePopover label="更多项目操作" icon={<MoreOne theme="outline" size={18}/>} align="right" className="workspace-more-menu">
                        {(close) => <>
                            {currentManager?.scene === DesignerScene.LOOP_CONTAINER && <>
                                <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); returnPrevProject(); }}>
                                    <Return theme="outline" size={17}/><span>返回主项目</span>
                                </button>
                                <div className="workspace-menu-separator"/>
                            </>}
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); throttleSave(); }}><HardDiskOne theme="outline" size={17}/><span>保存项目</span></button>
                            <div className="workspace-menu-separator"/>
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); importProject(); }}><AfferentFour theme="outline" size={17}/><span>导入项目</span></button>
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); exportProject(); }}><EfferentFour theme="outline" size={17}/><span>导出项目</span></button>
                            <div className="workspace-menu-separator"/>
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); footerStore.setCanvasRepairVisible(true); }}><Repair theme="outline" size={17}/><span>画布修复</span></button>
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); footerStore.setSnapshotRecoveryVisible(true); }}><MemoryOne theme="outline" size={17}/><span>本地自动存储恢复</span></button>
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); footerStore.setSnapShotVisible(true); }}><Pic theme="outline" size={17}/><span>设置封面快照</span></button>
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); footerStore.setHotKeyVisible(true); }}><Keyboard theme="outline" size={17}/><span>快捷键说明</span></button>
                            <div className="workspace-menu-separator"/>
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); createLoopContainer(); }}><span>创建循环容器</span></button>
                            <button type="button" role="menuitem" className="workspace-menu-item" onClick={() => { close(); openBlueprint(); }}><span>打开蓝图</span></button>
                        </>}
                    </WorkspacePopover>
                </div>
            </header>
            {designerHeaderStore.currentKey === 'project' && <ProjectHdItemImpl/>}
            {designerHeaderStore.currentKey === 'canvas' && <CanvasHdConfigImpl/>}
            {designerHeaderStore.currentKey === 'theme' && <ThemeHdItemImpl/>}
            {designerHeaderStore.currentKey === 'blue-print' && <BluePrintHdImpl/>}
            {designerHeaderStore.currentKey === 'release' && <ReleaseHdConfigImpl/>}
            <GlobalFilterConfigImpl/>
        </>
    );
});

export default Header;
