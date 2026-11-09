/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './GlobalVariable.less';
import {Plus} from "@icon-park/react";
import DesignerPanelHeader from '../panel-header/DesignerPanelHeader';
import {observer} from "mobx-react";
import GlobalVariableEditPanel from "./GlobalVariableEditPanel.tsx";
import {Button, globalModal} from "@datavisool/ui";

const GlobalVariableList = observer(() => {
    const {globalVariableManager} = window.DATAVISOOL_ENV.currentManager!;
    const {
        globalVariableInstance,
        setEditPanelVisible,
        editPanelVisible,
        deleteGlobalVariable,
        copyGlobalVariable,
        activeGlobalVariable
    } = globalVariableManager;
    const globalVariables = Object.values(globalVariableInstance);
    const confirmDeleteGlobalVariable = (id: string) => {
        globalModal.modalApi?.confirm({
            title: '提示信息',
            content: '删除后无法撤销，确认删除嘛？',
            okText: '是',
            cancelText: '否',
            onOk: () => deleteGlobalVariable(id),
        });
    };

    return (
        <div className={'global-variable'}>
            <DesignerPanelHeader title="全局变量" actions={
                <button type="button" className="designer-panel-header-button" title="新建全局变量"
                        aria-label="新建全局变量" onClick={() => setEditPanelVisible(true)}>
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
                                    {gv.bindTarget.length > 0 &&
                                        <span className="gv-badge">
                                            {gv.bindTarget.length} 处绑定
                                        </span>
                                    }
                                </div>
                                <div className={'gv-source'}>
                                    {gv.reRender ? '主动渲染' : '按需更新'}
                                </div>
                                <div className={'gv-operate'}>
                                    <Button type="text" size="sm" className="gv-action" onClick={() => {
                                        activeGlobalVariable(gv.id);
                                        setEditPanelVisible(true);
                                    }}>编辑</Button>
                                    <Button type="text" size="sm" className="gv-action" onClick={() => {
                                        copyGlobalVariable(gv.id);
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
                                    onClick={() => setEditPanelVisible(true)}>
                                新建变量
                            </Button>
                        </div>
                    )
                }
            </div>
            {editPanelVisible && <GlobalVariableEditPanel/>}
        </div>
    )
})

export default GlobalVariableList;
