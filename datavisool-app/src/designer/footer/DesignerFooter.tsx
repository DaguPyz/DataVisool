/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './DesignerFooter.less';
import {observer} from 'mobx-react';
import {useEffect, useState} from 'react';
import {ClickTap, CodeBrackets, Magnet, Ruler} from '@icon-park/react';
import {globalMessage} from '@datavisool/ui';
import footerStore from './FooterStore';
import eventOperateStore from '@/designer/operate-provider/EventOperateStore';
import managerStore from '@/designer/manager/ManagerStore.ts';
import {DesignerScene} from '@datavisool/sdk/types';
import {CoverConfig} from './cover/CoverConfig.tsx';
import {HotKeyDes} from './hotkey-des/HotKeyDes';
import ConfigCode from '@/comps/common-component/config-code/ConfigCode.tsx';
import RestoreLocalStorage from './auto-save/RestoreLocalStorage.tsx';
import CanvasRepairModal from './canvas-repair/CanvasRepairModal.tsx';
import {tx} from '@/i18n/miniI18n.ts';
import {useLocaleVersion} from '@/i18n/useLocaleVersion.ts';
import viewportStore from '@/designer/workspace/viewport/ViewportStore.ts';
import useToolbarMagnification from '@/designer/workspace/toolbar/useToolbarMagnification.ts';

const sceneMap = {
    [DesignerScene.DEFAULT]: '主项目',
    [DesignerScene.SUB_PROJECT]: '子项目',
    [DesignerScene.LOOP_CONTAINER]: '循环容器',
};

const DesignerFooter = observer(() => {
    const toolbarRef = useToolbarMagnification();
    useLocaleVersion();
    const layerManager = window.DATAVISOOL_ENV.currentManager.layerManager;
    const [eventState, setEventState] = useState({manager: layerManager, enabled: layerManager.enableEvent});
    const enableEvent = eventState.manager === layerManager ? eventState.enabled : layerManager.enableEvent;
    useEffect(() => setEventState({manager: layerManager, enabled: layerManager.enableEvent}), [layerManager]);
    const {layerConfigs, enableAdsorption} = layerManager;
    const {currentManager, designerScene} = managerStore;
    const toggleHotKeyDes = () => footerStore.setHotKeyVisible(!footerStore.hotKeyVisible);
    const toggleSnapShot = () => footerStore.setSnapShotVisible(!footerStore.snapShotVisible);
    const toggleEnableEvent = () => {
        const next = !layerManager.enableEvent;
        layerManager.setEnableEvent(next);
        setEventState({manager: layerManager, enabled: next});
    };
    const toggleAdsorption = () => layerManager.setEnableAdsorption(!layerManager.enableAdsorption);
    const toggleConfigCode = () => {
        const {targetIds} = eventOperateStore;
        if (targetIds.length === 1 && layerConfigs[targetIds[0]]?.type !== 'group')
            footerStore.setConfigCodeVisible(true);
        else
            globalMessage.messageApi?.info(tx('请选择组件后进行操作'));
    };
    return (
        <>
            <div className="datavisool-designer-footer" data-viewport-ui="">
                <div ref={toolbarRef} className="workspace-footer-actions" role="group" aria-label="编辑辅助操作" data-toolbar-magnification="">
                    <button type="button" className={`workspace-icon-button workspace-footer-button ${enableEvent ? 'is-active' : ''}`}
                            aria-label="允许触发组件原生事件" aria-pressed={enableEvent} title="允许触发组件原生事件"
                            onClick={toggleEnableEvent}><ClickTap theme="outline" size={18}/></button>
                    <button type="button" className={`workspace-icon-button workspace-footer-button ${enableAdsorption ? 'is-active' : ''}`}
                            aria-label="开启排版吸附" aria-pressed={enableAdsorption} title="开启排版吸附"
                            onClick={toggleAdsorption}><Magnet theme="outline" size={18}/></button>
                    <button type="button" className={`workspace-icon-button workspace-footer-button ${viewportStore.showRulers ? 'is-active' : ''}`}
                            aria-label="显示标尺" aria-pressed={viewportStore.showRulers} title="显示标尺"
                            onClick={() => viewportStore.toggleRulers()}><Ruler theme="outline" size={18}/></button>
                    <button type="button" className="workspace-icon-button workspace-footer-button"
                            aria-label="以代码编辑组件配置" title="以代码编辑组件配置"
                            onClick={toggleConfigCode}><CodeBrackets theme="outline" size={18}/></button>
                </div>
                <div className="workspace-footer-status" title={`${currentManager?.name ?? ''} · ${tx(sceneMap[designerScene])} · ${Object.keys(layerConfigs).length} 个图层`}>
                    <span className="workspace-footer-project">{currentManager?.name || '当前项目'}</span>
                    <span>{tx(sceneMap[designerScene])}</span>
                    <span className="workspace-footer-separator" aria-hidden="true"/>
                    <span>图层 {Object.keys(layerConfigs).length}</span>
                </div>
            </div>
            {footerStore.hotKeyVisible && <HotKeyDes onClose={toggleHotKeyDes}/>}
            {footerStore.snapShotVisible && <CoverConfig onClose={toggleSnapShot}/>}
            {footerStore.configCodeVisible && <ConfigCode/>}
            <CanvasRepairModal/>
            <RestoreLocalStorage/>
        </>
    );
});

export default DesignerFooter;
