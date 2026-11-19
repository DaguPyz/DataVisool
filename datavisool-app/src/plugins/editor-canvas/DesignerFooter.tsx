/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import '@/plugins/editor-canvas/DesignerFooter.less';
import {observer} from 'mobx-react';
import {type ReactNode} from 'react';
import {ClickTap, Magnet, Ruler} from '@icon-park/react';
import {DesignerScene} from '@datavisool/sdk/types';
import {tx} from '@/i18n/miniI18n.ts';
import {useLocaleVersion} from '@/i18n/useLocaleVersion.ts';
import {useEditorCanvasActivation} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';
import useToolbarMagnification from '@/shared/components/toolbar/useToolbarMagnification.ts';

const sceneMap = {
    [DesignerScene.DEFAULT]: '主项目',
    [DesignerScene.SUB_PROJECT]: '子项目',
    [DesignerScene.LOOP_CONTAINER]: '循环容器',
};

const DesignerFooter = observer(({inspectorAction}: {inspectorAction?: ReactNode}) => {
    const activation = useEditorCanvasActivation();
    const {viewportStore, sceneStore} = activation;
    const toolbarRef = useToolbarMagnification();
    useLocaleVersion();
    sceneStore.revision;
    const scene = activation.readScene();
    const workspace = activation.readWorkspace();
    const options = sceneStore.readOptions();
    if (!scene) return null;
    const layerConfigs = sceneStore.readLayerConfigs();
    const enableEvent = options.enableEvent ?? false;
    const enableAdsorption = options.enableAdsorption ?? false;
    const designerScene = !workspace?.nested
        ? DesignerScene.DEFAULT
        : workspace.loopPath?.length
            ? DesignerScene.LOOP_CONTAINER
            : DesignerScene.SUB_PROJECT;
    const editable = activation.canEdit();
    const toggleEnableEvent = () => sceneStore.updateOptions({enableEvent: !enableEvent});
    const toggleAdsorption = () => sceneStore.updateOptions({enableAdsorption: !enableAdsorption});
    return (
        <div className="datavisool-designer-footer" data-viewport-ui="">
            <div ref={toolbarRef} className="workspace-footer-actions" role="group" aria-label="编辑辅助操作" data-toolbar-magnification="">
                <button type="button" className={`workspace-icon-button workspace-footer-button ${enableEvent ? 'is-active' : ''}`}
                        aria-label="允许触发组件原生事件" aria-pressed={enableEvent} title="允许触发组件原生事件"
                        disabled={!editable} onClick={toggleEnableEvent}><ClickTap theme="outline" size={18}/></button>
                <button type="button" className={`workspace-icon-button workspace-footer-button ${enableAdsorption ? 'is-active' : ''}`}
                        aria-label="开启排版吸附" aria-pressed={enableAdsorption} title="开启排版吸附"
                        disabled={!editable} onClick={toggleAdsorption}><Magnet theme="outline" size={18}/></button>
                <button type="button" className={`workspace-icon-button workspace-footer-button ${viewportStore.showRulers ? 'is-active' : ''}`}
                        aria-label="显示标尺" aria-pressed={viewportStore.showRulers} title="显示标尺"
                        disabled={!editable} onClick={() => viewportStore.toggleRulers()}><Ruler theme="outline" size={18}/></button>
                {inspectorAction}
            </div>
            <div className="workspace-footer-status" title={`${scene.name ?? ''} · ${tx(sceneMap[designerScene])} · ${Object.keys(layerConfigs).length} 个图层`}>
                <span className="workspace-footer-project">{scene.name || '当前项目'}</span>
                <span>{tx(sceneMap[designerScene])}</span>
                <span className="workspace-footer-separator" aria-hidden="true"/>
                <span>图层 {Object.keys(layerConfigs).length}</span>
            </div>
        </div>
    );
});

export default DesignerFooter;
