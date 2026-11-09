/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {observer} from 'mobx-react';
import {AddOne, ColorFilter, ConnectionPointTwo, Cycle, DashboardOne, HandDrag, Help, Mouse, RectangleOne, Ruler, Theme, Undo, Redo} from '@icon-park/react';
import viewportStore from '@/designer/workspace/viewport/ViewportStore.ts';
import designerLeftStore from '@/designer/left/DesignerLeftStore.ts';
import designerHeaderStore from '@/designer/header/DesignerHeaderStore.ts';
import eventOperateStore from '@/designer/operate-provider/EventOperateStore';
import historyRecordOperateProxy from '@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts';
import {IdGenerate} from '@datavisool/sdk';
import type {ILayerItem} from '@datavisool/sdk/types';
import DesignerLoader from '@/designer/loader/DesignerLoader.ts';
import {createLoopContainer, redo, undo} from '@/designer/operate-provider/hot-key/HotKeyImpl.ts';
import footerStore from '@/designer/footer/FooterStore.ts';
import shortcutStore from '@/designer/operate-provider/hot-key/ShortcutStore.ts';
import {SHORTCUT_ACTION_IDS} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';
import {getShortcutDisplayParts, getShortcutPlatform} from '@/designer/operate-provider/hot-key/HotKeyPlatform.ts';
import useToolbarMagnification from './useToolbarMagnification.ts';
import './WorkspaceToolbar.less';

const getToolShortcutTitle = (actionId: typeof SHORTCUT_ACTION_IDS.CANVAS_TOOL_SELECT | typeof SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND) => {
    const binding = shortcutStore.getBinding(actionId);
    const shortcut = binding ? getShortcutDisplayParts(binding, getShortcutPlatform()).join(' + ') : '已禁用';
    return `${actionId === SHORTCUT_ACTION_IDS.CANVAS_TOOL_SELECT ? '选择' : '抓手'}工具 (${shortcut})`;
};

const addBaseLayer = (type: 'BaseText' | 'BaseColorBlock') => {
    const definition = DesignerLoader.definitionMap[type];
    const manager = window.DATAVISOOL_ENV.currentManager;
    if (!definition || !manager?.canvasManager)
        return;
    const baseInfo = definition.getBaseInfo();
    const width = baseInfo.width ?? 200;
    const height = baseInfo.height ?? 200;
    const id = IdGenerate.generateId();
    const layer: ILayerItem = {
        id,
        name: baseInfo.compName ?? type,
        type,
        x: Math.round(((manager.canvasManager.canvasConfig.width ?? 0) - width) / 2),
        y: Math.round(((manager.canvasManager.canvasConfig.height ?? 0) - height) / 2),
        width,
        height,
        lock: false,
        hide: false,
    };
    eventOperateStore.setAddRecordCompId(id);
    historyRecordOperateProxy.doAdd(layer);
};

const WorkspaceToolbar = observer(({onReturnHome}: {onReturnHome: () => void}) => {
    const toolbarRef = useToolbarMagnification();
    const openBlueprint = () => {
        eventOperateStore.setTargetIds([]);
        designerHeaderStore.setCurrentKey('blue-print');
    };
    const openComponents = () => designerLeftStore.togglePanel('components');

    return (
        <div ref={toolbarRef} className="workspace-toolbar-container" data-toolbar-magnification="">
            <div className="workspace-home-control">
                <button type="button" className="workspace-icon-button" aria-label="返回首页" title="返回首页"
                        onClick={onReturnHome}><DashboardOne theme="outline" size={19}/></button>
            </div>
            <div className="workspace-toolbar" role="toolbar" aria-label="画布工具" data-workspace-toolbar="">
                <div className="workspace-toolbar-group">
                    <button type="button" className={`workspace-icon-button ${viewportStore.toolMode === 'select' ? 'is-active' : ''}`}
                            aria-label="选择工具" aria-pressed={viewportStore.toolMode === 'select'} title={getToolShortcutTitle(SHORTCUT_ACTION_IDS.CANVAS_TOOL_SELECT)}
                            onClick={() => viewportStore.setToolMode('select')}><Mouse theme="outline" size={19}/></button>
                    <button type="button" className={`workspace-icon-button ${viewportStore.toolMode === 'hand' ? 'is-active' : ''}`}
                            aria-label="抓手工具" aria-pressed={viewportStore.toolMode === 'hand'} title={getToolShortcutTitle(SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND)}
                            onClick={() => viewportStore.setToolMode('hand')}><HandDrag theme="outline" size={19}/></button>
                </div>
                <span className="workspace-toolbar-divider" aria-hidden="true"/>
                <div className="workspace-toolbar-group">
                    <button type="button" className="workspace-icon-button" aria-label="打开组件库" title="组件库"
                            onClick={openComponents}><AddOne theme="outline" size={19}/></button>
                    <button type="button" className="workspace-icon-button" aria-label="添加基础文本" title="添加文本"
                            onClick={() => addBaseLayer('BaseText')}><span className="workspace-text-icon">T</span></button>
                    <button type="button" className="workspace-icon-button" aria-label="添加基础色块" title="添加基础色块"
                            onClick={() => addBaseLayer('BaseColorBlock')}><RectangleOne theme="outline" size={19}/></button>
                </div>
                <span className="workspace-toolbar-divider workspace-toolbar-secondary" aria-hidden="true"/>
                <div className="workspace-toolbar-group workspace-toolbar-secondary">
                    <button type="button" className="workspace-icon-button" aria-label="新建循环容器" title="循环容器"
                            onClick={createLoopContainer}><Cycle theme="outline" size={19}/></button>
                    <button type="button" className="workspace-icon-button" aria-label="打开蓝图编辑器" title="蓝图"
                            onClick={openBlueprint}><ConnectionPointTwo theme="outline" size={19}/></button>
                </div>
                <span className="workspace-toolbar-divider" aria-hidden="true"/>
                <div className="workspace-toolbar-group workspace-toolbar-settings">
                    <button type="button" className="workspace-icon-button" aria-label="画布设置" title="画布设置"
                            onClick={() => designerHeaderStore.setCurrentKey('canvas')}><Ruler theme="outline" size={19}/></button>
                    <button type="button" className="workspace-icon-button" aria-label="主题设置" title="主题设置"
                            onClick={() => designerHeaderStore.setCurrentKey('theme')}><Theme theme="outline" size={19}/></button>
                    <button type="button" className="workspace-icon-button" aria-label="全局滤镜" title="全局滤镜"
                            onClick={() => designerHeaderStore.setCurrentKey('global-filter')}><ColorFilter theme="outline" size={19}/></button>
                </div>
                <span className="workspace-toolbar-divider workspace-toolbar-history-divider" aria-hidden="true"/>
                <div className="workspace-toolbar-group workspace-toolbar-history">
                    <button type="button" className="workspace-icon-button" aria-label="撤销" title="撤销 (Ctrl/⌘ Z)" onClick={undo}><Undo theme="outline" size={18}/></button>
                    <button type="button" className="workspace-icon-button" aria-label="重做" title="重做 (Ctrl/⌘ Shift Z)" onClick={redo}><Redo theme="outline" size={18}/></button>
                    <button type="button" className="workspace-icon-button" aria-label="快捷键帮助" title="帮助与快捷键" onClick={() => footerStore.setHotKeyVisible(true)}><Help theme="outline" size={18}/></button>
                </div>
            </div>
        </div>
    );
});

export default WorkspaceToolbar;
