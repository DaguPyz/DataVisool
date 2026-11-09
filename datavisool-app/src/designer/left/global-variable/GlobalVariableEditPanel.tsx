/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import {Dialog, FieldChangeData, DatavisoolGUI, type Control} from "@datavisool/ui";
import DataSourceConfig from "@/comps/common-component/data-source-config/DataSourceConfig.tsx";
import './GlobalVariable.less';
import {ObjectUtil} from "@datavisool/sdk";
import {DataConfigType} from "@datavisool/sdk/types";
import {normalizeDataConfigAsync} from "@/util/DataSourceConfigUtil.ts";
import {useRef} from "react";

const GlobalVariableEditPanel = observer(() => {

    const {globalVariableManager} = window.DATAVISOOL_ENV.currentManager!;
    const {
        editGlobalVariable,
        createOrUpdateGlobalVariable,
        setEditGlobalVariable,
        setEditPanelVisible
    } = globalVariableManager;
    const saveVersionRef = useRef(0);
    const editVersionRef = useRef(0);
    const schema: Control = {
        type: 'grid',
        children: [
            {
                key: 'key',
                type: 'input',
                label: '变量名',
                value: editGlobalVariable?.key
            },
            {
                key: 'reRender',
                type: 'switch',
                label: '主动渲染',
                tip: '开启后，修改该变量数据时，会主动触发绑定了该变量的组件进行一次重新渲染，可以立马刷新组件数据',
                value: editGlobalVariable?.reRender
            }
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        editVersionRef.current += 1;
        const {dataFragment} = fieldChangeData;
        const {editGlobalVariable} = globalVariableManager;
        setEditGlobalVariable(ObjectUtil.merge(editGlobalVariable, dataFragment));
    }


    return (
        <Dialog title={editGlobalVariable?.id ? '编辑全局变量' : '新建全局变量'} open={true}
                centered={true} width="min(800px, calc(100vw - 32px))" height="80vh" mask maskClosable={false} showClose
                onClose={() => {
                   saveVersionRef.current += 1;
                   setEditPanelVisible(false);
               }}>
            <div className="global-variable-edit-panel">
                <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
                <DataSourceConfig saveUnchangedStaticData data={editGlobalVariable?.triggerSource ?? {sourceType: 'static'}}
                                  range={['static', 'api', 'database', 'commonApi', 'webSocket', 'mqtt']}
                                  onSave={async (config: DataConfigType) => {
                                      const saveVersion = ++saveVersionRef.current;
                                      const editVersion = editVersionRef.current;
                                      const editingTarget = globalVariableManager.editGlobalVariable;
                                      if (!editingTarget)
                                          return;
                                      const normalizedConfig = await normalizeDataConfigAsync(editingTarget?.triggerSource ?? {sourceType: 'static'}, config as Record<string, any>);
                                      if (
                                          saveVersion !== saveVersionRef.current
                                          || editVersion !== editVersionRef.current
                                          || !globalVariableManager.editPanelVisible
                                          || globalVariableManager.editGlobalVariable !== editingTarget
                                      )
                                          return;
                                      setEditGlobalVariable(ObjectUtil.merge(editingTarget, {triggerSource: normalizedConfig, value: normalizedConfig.value}));
                                      createOrUpdateGlobalVariable();
                                  }}
                />
                <p style={{
                    color: '#959595',
                    margin: '10px 0 0 0',
                    fontSize: 12
                }}>提示：任何情况下，都建议你设置静态数据值，他将作为当前变量的默认值使用，当其他数据来源没有首次更新数据时，会使用默认值作为当前变量的值</p>
            </div>
        </Dialog>
    )
})

export default GlobalVariableEditPanel;
