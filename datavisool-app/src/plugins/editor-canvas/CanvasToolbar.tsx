/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import './CanvasToolbar.less';
import {observer} from 'mobx-react';
import {Cycle, HandDrag, Mouse, RectangleOne, Redo, Undo} from '@icon-park/react';
import {IdGenerate} from '@datavisool/sdk';
import {SHORTCUT_ACTION_IDS} from '@datavisool/sdk/plugin/contracts/editorShortcuts';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import {useEditorCommands} from '@/shared/designer/EditorCommandContext.ts';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import {useEditorShell} from '@/shared/designer/EditorShellContext.ts';
import {useEditorCanvasActivation} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';

export const CanvasToolButtons = observer(() => {
    const {viewportStore} = useEditorCanvasActivation();
    const shell = useEditorShell();
    const select = shell.readShortcutHint(SHORTCUT_ACTION_IDS.CANVAS_TOOL_SELECT)?.join(' + ') || '已禁用';
    const hand = shell.readShortcutHint(SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND)?.join(' + ') || '已禁用';
    return <>
        <button type="button" className={`workspace-icon-button ${viewportStore.toolMode === 'select' ? 'is-active' : ''}`}
                aria-label="选择工具" aria-pressed={viewportStore.toolMode === 'select'} title={`选择工具 (${select})`}
                onClick={() => viewportStore.setToolMode('select')}><Mouse theme="outline" size={19}/></button>
        <button type="button" className={`workspace-icon-button ${viewportStore.toolMode === 'hand' ? 'is-active' : ''}`}
                aria-label="抓手工具" aria-pressed={viewportStore.toolMode === 'hand'} title={`抓手工具 (${hand})`}
                onClick={() => viewportStore.setToolMode('hand')}><HandDrag theme="outline" size={19}/></button>
    </>;
});

export const CanvasQuickAddButtons = observer(({canvas, catalog}: {canvas: EditorCanvasService; catalog: DesignerCatalog}) => {
    const scene = useEditorScene();
    const add = (type: 'BaseText' | 'BaseColorBlock') => {
        const component = catalog.getComponent(type);
        const config = scene?.readCanvasConfig();
        if (!component || !config) return;
        const {compName, width = 200, height = 200} = component.baseInfo;
        canvas.insertLayer({
            id: IdGenerate.generateId(), name: compName, type, width, height, lock: false, hide: false,
            x: Math.round(((config.width ?? 0) - width) / 2),
            y: Math.round(((config.height ?? 0) - height) / 2),
        });
    };
    return <>
        <button type="button" className="workspace-icon-button" aria-label="添加基础文本" title="添加文本"
                onClick={() => add('BaseText')}><span className="workspace-text-icon">T</span></button>
        <button type="button" className="workspace-icon-button" aria-label="添加基础色块" title="添加基础色块"
                onClick={() => add('BaseColorBlock')}><RectangleOne theme="outline" size={19}/></button>
    </>;
});

export function CanvasLoopButton() {
    const commands = useEditorCommands();
    return <button type="button" className="workspace-icon-button" aria-label="新建循环容器" title="循环容器"
                   onClick={() => { void commands.execute('canvas.create-loop').catch(error => console.error('新建循环容器失败', error)); }}>
        <Cycle theme="outline" size={19}/>
    </button>;
}

export function CanvasHistoryButtons({canvas}: {canvas: EditorCanvasService}) {
    return <>
        <button type="button" className="workspace-icon-button" aria-label="撤销" title="撤销 (Ctrl/⌘ Z)"
                onClick={() => canvas.undo()}><Undo theme="outline" size={18}/></button>
        <button type="button" className="workspace-icon-button" aria-label="重做" title="重做 (Ctrl/⌘ Shift Z)"
                onClick={() => canvas.redo()}><Redo theme="outline" size={18}/></button>
    </>;
}
