/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Dialog, FieldChangeData, DatavisoolGUI, type Control} from "@datavisool/ui";
import DataSourceConfig from "@/comps/common-component/data-source-config/DataSourceConfig.tsx";
import './GlobalVariable.less';
import {ObjectUtil} from "@datavisool/sdk";
import type {DataConfigType, IGlobalVariable} from '@datavisool/sdk/types';
import {normalizeDataConfigAsync} from "@/util/DataSourceConfigUtil.ts";
import {useEffect, useRef, useState} from 'react';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';

const createTestConfig = (canEdit: () => boolean) => <T,>(config: T) => {
    if (!canEdit()) throw new DOMException('全局变量编辑已暂停。', 'AbortError');
    return config;
};
const ignoreTestResult = (_data: unknown) => undefined;

const GlobalVariableEditPanel = ({initialValue, onClose, onSave, canEdit, trackTask}: {
    initialValue: IGlobalVariable;
    onClose(): void;
    onSave(value: IGlobalVariable): void;
    canEdit(): boolean;
    trackTask<T>(task: Promise<T>): Promise<T>;
}) => {
    const scene = useEditorScene();
    const [draft, setDraft] = useState(initialValue);
    const draftRef = useRef(initialValue);
    const saveVersionRef = useRef(0);
    const activeRef = useRef(true);

    useEffect(() => {
        activeRef.current = true;
        return () => {
            activeRef.current = false;
            saveVersionRef.current += 1;
        };
    }, []);

    const updateDraft = (value: IGlobalVariable) => {
        if (!activeRef.current || !canEdit()) return;
        draftRef.current = value;
        setDraft(value);
    };

    const close = () => {
        if (!canEdit()) return;
        activeRef.current = false;
        saveVersionRef.current += 1;
        onClose();
    };

    const save = async (data: DataConfigType) => {
        if (!activeRef.current || !canEdit()) return;
        const version = ++saveVersionRef.current;
        const submitted = draftRef.current;
        const normalized = await trackTask(normalizeDataConfigAsync(submitted.triggerSource ?? {sourceType: 'static'}, data as Record<string, any>));
        if (!activeRef.current || !canEdit() || version !== saveVersionRef.current || draftRef.current !== submitted) return;
        const next = {...submitted, triggerSource: normalized, value: normalized.value};
        updateDraft(next);
        onSave(next);
    };
    const schema: Control = {
        type: 'grid',
        children: [
            {
                key: 'key',
                type: 'input',
                label: '变量名',
                value: draft.key
            },
            {
                key: 'reRender',
                type: 'switch',
                label: '主动渲染',
                tip: '开启后，修改该变量数据时，会主动触发绑定了该变量的组件进行一次重新渲染，可以立马刷新组件数据',
                value: draft.reRender
            }
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        if (!canEdit()) return;
        const {dataFragment} = fieldChangeData;
        updateDraft(ObjectUtil.merge({...draftRef.current}, dataFragment));
    }


    const testConfig = createTestConfig(canEdit);

    return (
        <Dialog title={draft.id ? '编辑全局变量' : '新建全局变量'} open={true}
                centered={true} width="min(800px, calc(100vw - 32px))" height="80vh" mask maskClosable={false} showClose
                onClose={close}>
            <div className="global-variable-edit-panel">
                <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
                <DataSourceConfig saveUnchangedStaticData data={draft.triggerSource ?? {sourceType: 'static'}}
                                  range={['static', 'api', 'database', 'commonApi', 'webSocket', 'mqtt']}
                                  globalVariableOptions={(scene?.variables.list() ?? []).map(item => ({label: item.key, value: item.id}))}
                                  readGlobalVariableValue={id => scene?.variables.read(id)?.value}
                                  apiTestBefore={testConfig} apiTestAfter={ignoreTestResult}
                                  commonApiTestBefore={testConfig} commonApiTestAfter={ignoreTestResult}
                                  databaseTestBefore={testConfig} databaseTestAfter={ignoreTestResult}
                                  globalVariableTestBefore={testConfig} globalVariableTestAfter={ignoreTestResult}
                                  wsTestBefore={testConfig} wsTestAfter={ignoreTestResult}
                                  mqttTestBefore={testConfig} mqttTestAfter={ignoreTestResult}
                                  onSave={save}
                />
                <p style={{
                    color: '#959595',
                    margin: '10px 0 0 0',
                    fontSize: 12
                }}>提示：任何情况下，都建议你设置静态数据值，他将作为当前变量的默认值使用，当其他数据来源没有首次更新数据时，会使用默认值作为当前变量的值</p>
            </div>
        </Dialog>
    )
};

export default GlobalVariableEditPanel;
