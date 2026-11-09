/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useRef, useState} from "react";
import {Control, FieldChangeData, globalMessage, DatavisoolGUI} from "@datavisool/ui";
import {ObjectUtil} from "@datavisool/sdk";
import {IGlobalVariableDataConfigType} from "@datavisool/sdk/types";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";
import DataUtil from "@/util/DataUtil.ts";

export interface GlobalVariableConfigProps {
    data: IGlobalVariableDataConfigType;
    doTestBefore?: (config: IGlobalVariableDataConfigType) => IGlobalVariableDataConfigType;
    doTestAfter?: (data: any) => any;
    /**
     * @param config 配置数据
     * @param testData 测试数据
     */
    onSave: (config: IGlobalVariableDataConfigType, testData: any) => void;
}

export function GlobalVariableConfig(props: GlobalVariableConfigProps) {
    const {data, doTestAfter, onSave} = props;
    const dataRef = useRef<IGlobalVariableDataConfigType>(ObjectUtil.merge({
        gvId: undefined,
        filter: undefined,
    }, data));
    const gvTestResRef = useRef<string>("")
    const [count, setCount] = useState(0);
    const {globalVariableInstance} = window.DATAVISOOL_ENV.currentManager?.globalVariableManager ?? {};
    const options = Object.values(globalVariableInstance ?? {}).map((item) => {
        return {
            label: item.key,
            value: item.id
        }
    })


    const schema: Control = {
        type: 'grid',
        config: {gridGap: '10px'},
        children: [
            {
                key: 'gvId',
                type: 'select',
                label: '全局变量',
                value: dataRef.current?.gvId || '',
                config: {options}
            },
            {
                type: 'card-panel',
                label: '过滤器',
                config: {
                    contentStyle: {padding: 0}
                },
                children: [
                    {
                        key: 'filter',
                        type: 'code-editor',
                        config: {
                            height: 200,
                            language: 'javascript',
                            fullScreen: true
                        },
                        value: dataRef.current?.filter || "function filter(data){\n\treturn data\n}",
                    }
                ]
            },
            {
                type: 'card-panel',
                label: '响应结果',
                config: {
                    contentStyle: {padding: 0}
                },
                children: [
                    {
                        id: 'gvTestRes',
                        type: 'code-editor',
                        config: {
                            readonly: true,
                            height: 200,
                        },
                        reRender: true,
                        value: gvTestResRef.current,
                    }
                ]
            },
            {
                type: 'grid',
                config: {columns: 2},
                children: [
                    {
                        id: 'doTest',
                        type: 'button',
                        config: {
                            children: '测试',
                            type: 'default',
                            background: '#474747',
                        }
                    },
                    {
                        id: 'doSave',
                        type: 'button',
                        config: {
                            children: '保存',
                        }
                    }
                ]
            },
        ]
    }


    const doTest = async () => {
        if (!dataRef.current?.gvId) {
            globalMessage.messageApi?.warning('请先选择全局变量');
            return;
        }
        try {
            const {globalVariableInstance} = window.DATAVISOOL_ENV.currentManager?.globalVariableManager ?? {};
            const gv = globalVariableInstance?.[dataRef.current?.gvId];
            if (!gv) {
                globalMessage.messageApi?.warning('全局变量不存在');
                return;
            }
            let gvValue = gv.value;
            const filter = dataRef.current?.filter;
            gvValue = await DataUtil.applyFilterAsync(gvValue, filter);
            if (gvValue != null) {
                gvTestResRef.current = JSON.stringify(gvValue, null, 2);
                doTestAfter && doTestAfter(gvValue);
            }
        } catch (e) {
            globalMessage.messageApi?.error('测试未通过');
            JSON.stringify({msg: '测试未通过'}, null, 2);
            console.error(e);
        } finally {
            setCount(count + 1);
        }
    }

    const doSave = () => {
        if (!dataRef.current?.gvId) {
            globalMessage.messageApi?.warning('请先选择全局变量');
            return;
        }
        onSave(dataRef.current, SafeEvalUtil.run(gvTestResRef.current));
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {reRender, id, dataFragment} = fieldChangeData;
        if (id === 'doTest')
            doTest();
        else if (id === 'doSave')
            doSave();
        else if (id === 'gvTestRes')
            return
        else {
            dataRef.current = ObjectUtil.merge(dataRef.current, dataFragment)
        }
        if (reRender)
            setCount(count + 1)
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    );
}
