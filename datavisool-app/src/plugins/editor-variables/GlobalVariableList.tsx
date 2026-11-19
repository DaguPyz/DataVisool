/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './GlobalVariable.less';
import {Plus} from "@icon-park/react";
import DesignerPanelHeader from '@/shared/components/panel-header/DesignerPanelHeader';
import {observer} from "mobx-react";
import GlobalVariableEditPanel from "./GlobalVariableEditPanel.tsx";
import {Button, globalMessage, globalModal} from '@datavisool/ui';
import {useEffect, useRef, useState} from 'react';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import type {DesignerSceneVariables, DesignerVariableWriteResult} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {IGlobalVariable} from '@datavisool/sdk/types';

function showVariableError(result: DesignerVariableWriteResult) {
    if (result === 'missing-name') globalMessage.messageApi?.error('请填写变量名');
    if (result === 'duplicate-name') globalMessage.messageApi?.error('全局变量名重复');
    if (result === 'missing-variable') globalMessage.messageApi?.error('全局变量已不存在');
}

interface VariablePanelLifecycle {
    canEdit(): boolean;
    trackTask<T>(task: Promise<T>): Promise<T>;
}

const SceneVariableList = observer(({variables, onClose, canEdit, trackTask}: {variables: DesignerSceneVariables; onClose(): void; canEdit(): boolean; trackTask<T>(task: Promise<T>): Promise<T>}) => {
    const globalVariables = variables.list();
    const [draft, setDraft] = useState<IGlobalVariable>();
    const confirmation = useRef<string>();

    useEffect(() => () => {
        if (confirmation.current) globalModal.modalApi?.destroy(confirmation.current);
    }, []);

    const newVariable = () => { if (canEdit()) setDraft({triggerSource: {sourceType: 'static'}}); };
    const saveVariable = (variable: IGlobalVariable) => {
        if (!canEdit()) return;
        const result = variables.save(variable);
        if (result === 'saved') {
            setDraft(undefined);
            globalMessage.messageApi?.success('保存成功');
        } else {
            showVariableError(result);
        }
    };

    const confirmDeleteGlobalVariable = (id: string) => {
        if (!canEdit()) return;
        if (confirmation.current) return;
        confirmation.current = globalModal.modalApi?.confirm({
            title: '提示信息',
            content: '删除后无法撤销，确认删除嘛？',
            okText: '是',
            cancelText: '否',
            onOk: () => canEdit() ? variables.remove(id) : false,
            afterClose: () => { confirmation.current = undefined; },
        });
    };

    return (
        <div className={'global-variable'}>
            <DesignerPanelHeader onClose={onClose} title="全局变量" actions={
                        <button type="button" className="designer-panel-header-button" title="新建全局变量"
                        aria-label="新建全局变量" onClick={newVariable}>
                    <Plus size={20} strokeWidth={1.5} aria-hidden="true"/>
                </button>
            }/>
            <div className={'global-variable-body'}>
                {
                    globalVariables.length > 0 ? globalVariables.map((gv) => {
                        return <div className={'gv-item'} key={gv.id}>
                            <div className={'gv-content'}>
                                <div className={'gv-name'}>
                                    <span className="gv-prefix" aria-hidden="true">#</span>
                                    <span className="gv-key" title={gv.key}>{gv.key}</span>
                                    {gv.bindingCount > 0 &&
                                        <span className="gv-badge">
                                            {gv.bindingCount} 处绑定
                                        </span>
                                    }
                                </div>
                                <div className={'gv-source'}>
                                    {gv.reRender ? '主动渲染' : '按需更新'}
                                </div>
                                <div className={'gv-operate'}>
                                    <Button type="text" size="sm" className="gv-action" onClick={() => {
                                        if (canEdit()) setDraft(variables.read(gv.id));
                                    }}>编辑</Button>
                                    <Button type="text" size="sm" className="gv-action" onClick={() => {
                                        if (canEdit()) showVariableError(variables.copy(gv.id));
                                    }}>复制</Button>
                                    <Button type="text" size="sm" className="gv-action delete" onClick={() => confirmDeleteGlobalVariable(gv.id)}>删除</Button>
                                </div>
                            </div>
                        </div>
                    }) : (
                        <div className={'gv-empty'}>
                            <div className={'gv-empty-title'}>暂无全局变量</div>
                            <div className={'gv-empty-desc'}>新建变量后可在组件和蓝图中复用</div>
                            <Button className="gv-empty-action"
                                    icon={<Plus size={16} strokeWidth={1.5} aria-hidden="true"/>}
                                    onClick={newVariable}>
                                新建变量
                            </Button>
                        </div>
                    )
                }
            </div>
            {draft && <GlobalVariableEditPanel initialValue={draft} onClose={() => { if (canEdit()) setDraft(undefined); }} onSave={saveVariable} canEdit={canEdit} trackTask={trackTask}/>}
        </div>
    )
})

const GlobalVariableList = observer(({onClose, canEdit, trackTask}: {onClose(): void} & VariablePanelLifecycle) => {
    const scene = useEditorScene();
    return scene ? <SceneVariableList key={scene.version} variables={scene.variables} onClose={() => { if (canEdit()) onClose(); }} canEdit={canEdit} trackTask={trackTask}/> : null;
});

export default GlobalVariableList;
