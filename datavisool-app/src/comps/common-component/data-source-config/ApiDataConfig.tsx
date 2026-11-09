/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useRef, useState} from "react";
import {Control, FieldChangeData, globalMessage, DatavisoolGUI} from "@datavisool/ui";
import {ObjectUtil} from "@datavisool/sdk";
import {APIConfig} from "@datavisool/sdk/types";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";
import FetchUtil from "@/util/FetchUtil.ts";
import DataUtil from "@/util/DataUtil.ts";

export interface ApiDataConfigProps {
    data: APIConfig;
    doTestBefore?: (config: APIConfig) => APIConfig;
    doTestAfter?: (data: any) => any;
    /**
     * @param config 配置数据
     * @param testData 测试数据
     */
    onSave: (config: APIConfig, testData?: any) => void;
}

export function ApiDataConfig(props: ApiDataConfigProps) {
    const {data, onSave, doTestBefore, doTestAfter} = props;
    const dataRef = useRef<APIConfig>(ObjectUtil.merge({
        url: '',
        method: 'get',
        header: {},
        params: {},
        autoFlush: false,
        frequency: 5,
        filter: undefined,
    }, data));
    const apiTestResRef = useRef<string>("")
    const [count, setCount] = useState(0);

    const schema: Control = {
        type: 'grid',
        config: {gridGap: '10px'},
        children: [
            {
                key: 'url',
                type: 'input',
                label: '接口地址',
                value: dataRef.current?.url || '',
            },
            {
                key: 'method',
                label: '请求方式',
                type: 'select',
                value: dataRef.current?.method,
                config: {
                    options: [
                        {value: 'get', label: 'GET'},
                        {value: 'post', label: 'POST'},
                    ]
                }
            },
            {
                type: 'grid',
                label: '自动更新',
                config: {
                    columns: 2,
                    responsive: false,
                    columnGap: '12px',
                    controlStyle: {
                        gridTemplateColumns: '64px minmax(0, 1fr)',
                        justifyContent: 'start',
                    },
                },
                children: [
                    {
                        key: 'autoFlush',
                        type: 'switch',
                        value: !!dataRef.current?.autoFlush,
                    },
                    {
                        key: 'frequency',
                        type: 'number-input',
                        config: {
                            min: 5,
                            controlStyle: {
                                width: '100%',
                                maxWidth: 152,
                                minWidth: 0,
                            },
                        },
                        value: dataRef.current?.frequency || 5,
                    },
                ]
            },
            {

                type: 'card-panel',
                label: '请求头',
                tip: '请求头信息，json格式或函数（支持异步）',
                config: {
                    contentStyle: {padding: 0}
                },
                children: [
                    {
                        id: 'headers',
                        key: 'headers',
                        type: 'code-editor',
                        config: {
                            language: 'javascript',
                            height: 100,
                            fullScreen: true
                        },
                        value: typeof dataRef.current?.headers === 'object' ? JSON.stringify(dataRef.current?.headers ?? {}, null, 2) : dataRef.current?.headers,
                    }
                ]
            },
            {
                type: 'card-panel',
                tip: '请求参数，json格式或函数（支持异步）',
                label: '请求参数',
                config: {
                    contentStyle: {padding: 0}
                },
                children: [
                    {
                        id: 'params',
                        key: 'params',
                        type: 'code-editor',
                        config: {
                            height: 100,
                            language: 'javascript',
                            fullScreen: true
                        },
                        value: typeof dataRef.current?.params === 'object' ? JSON.stringify(dataRef.current?.params ?? {}, null, 2) : dataRef.current?.params,
                    }
                ]
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
                            height: 100,
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
                        id: 'apiTestRes',
                        type: 'code-editor',
                        config: {
                            readonly: true,
                            height: 130,
                        },
                        reRender: true,
                        value: apiTestResRef.current,
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


    const validate = () => {
        if (!dataRef.current?.url) {
            globalMessage.messageApi?.error('接口地址不能为空');
            return false;
        }
        if (!dataRef.current?.method) {
            globalMessage.messageApi?.error('请求方式不能为空');
            return false;
        }
        if (typeof dataRef.current.headers === 'string') {
            const headerStr = dataRef.current.headers.trim();
            if (headerStr.startsWith('{') || headerStr.startsWith('[')) {
                // 如果是 JSON 字符串，尝试解析
                const header = SafeEvalUtil.run(headerStr);
                if (!header) {
                    globalMessage.messageApi?.warning('请求头不是标准的json格式，将尝试作为JS对象解析');
                }
            }
        }
        if (typeof dataRef.current.params === 'string') {
            const paramStr = dataRef.current.params.trim();
            if (paramStr.startsWith('{') || paramStr.startsWith('[')) {
                // 如果是 JSON 字符串，尝试解析
                const param = SafeEvalUtil.run(paramStr)
                if (!param) {
                    globalMessage.messageApi?.warning('请求参数不是标准的json格式，将尝试作为JS对象解析');
                }
            }
        }
        return true;
    }

    const doTest = () => {
        if (!validate())
            return;
        let testConfig = dataRef.current;
        if (doTestBefore)
            testConfig = doTestBefore(dataRef.current);
        const {params, headers, url, method, filter} = testConfig!;
        Promise.all([
            DataUtil.resolveHeaders(headers),
            DataUtil.resolveParams(params)
        ]).then(([resolvedHeaders, resolvedParams]) => {
            FetchUtil.doRequestNativeResult(url!, method!, resolvedHeaders, resolvedParams).then(async res => {
                if (res) {
                    res = await DataUtil.applyFilterAsync(res, filter);
                    if (res != null) {
                        apiTestResRef.current = JSON.stringify(res, null, 2);
                        doTestAfter && doTestAfter(res);
                    }
                } else {
                    apiTestResRef.current = JSON.stringify({msg: '请求错误'}, null, 2);
                    doTestAfter && doTestAfter(null);
                    globalMessage.messageApi?.warning('测试未通过');
                }
            }).finally(() => {
                setCount(count + 1);
            })
        })
    }

    const doSave = () => {
        if (!validate())
            return;
        onSave(dataRef.current, SafeEvalUtil.run(apiTestResRef.current));
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {reRender, id, dataFragment} = fieldChangeData;
        if (id === 'doTest')
            doTest();
        else if (id === 'doSave')
            doSave();
        else if (id === 'apiTestRes')
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
