/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {FieldChangeData, globalMessage, DatavisoolGUI, type Control} from "@datavisool/ui";
import {useRef, useState} from "react";
import {ICommonApi} from "@datavisool/sdk/types";
import {ObjectUtil} from "@datavisool/sdk";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";
import FetchUtil from "@/util/FetchUtil.ts";
import DataUtil from "@/util/DataUtil.ts";

export interface CommonApiConfigProps {
    data: ICommonApi;
    doTestBefore?: (config: ICommonApi) => ICommonApi;
    doTestAfter?: (data: any) => void;
    /**
     * @param config 配置数据
     * @param testData 测试数据
     */
    onSave: (config: ICommonApi, testData?: any) => void;
}

export default function CommonApiConfig(props: CommonApiConfigProps) {
    const {data, onSave, doTestBefore, doTestAfter} = props;
    const configRef = useRef<ICommonApi>(data ?? {});
    const [count, setCount] = useState(0);
    const testResultRef = useRef<string>("");

    const schema: Control = {
        type: 'grid',
        config: {gridGap: '10px'},
        children: [
            {
                key: 'commonApiId',
                label: '公共API',
                type: 'select',
                config: {
                    showSearch: true,
                    handleSearch: async (search: string) => {
                        const params = new URLSearchParams({search});
                        const response = await AuthFetchUtil.get<any>(`/api/commonApi/quickSearch?${params}`);
                        if (response !== 200)
                            return response.map((item: any) => ({label: item.name, value: item.id}));
                        else
                            return [];
                    }
                },
                value: configRef.current?.commonApiId,
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
                        value: !!configRef.current?.autoFlush,
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
                        value: configRef.current?.frequency || 5,
                    },
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
                            height: 200,
                            language: 'javascript',
                            fullScreen: true
                        },
                        value: configRef.current?.filter || "function filter(data){\n\treturn data\n}",
                    }
                ]
            },
            {
                type: 'card-panel',
                label: '测试结果',
                config: {
                    contentStyle: {padding: 0}
                },
                children: [
                    {
                        type: 'code-editor',
                        reRender: true,
                        config: {
                            height: 200,
                            language: 'javascript',
                        },
                        value: testResultRef.current ?? '',
                    }
                ]
            },
            {
                type: 'grid',
                config: {
                    columns: 2
                },
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
            }
        ]
    }

    const doTest = () => {
        if (!configRef.current?.commonApiId) {
            globalMessage.messageApi?.error('请先选择一个公共API');
            return;
        }
        AuthFetchUtil.get<ICommonApi>(`/api/commonApi/getCommonApi/${configRef.current?.commonApiId}`).then((response) => {
            if (response !== null) {
                const {url = '', method = 'GET', headers, params} = response;
                Promise.all([
                    DataUtil.resolveHeaders(headers),
                    DataUtil.resolveParams(params)
                ]).then(([resolvedHeaders, resolvedParams]) => {
                    FetchUtil.doRequestNativeResult(url, method as any, resolvedHeaders, resolvedParams).then(async result => {
                        let testConfig = configRef.current;
                        if (doTestBefore)
                            testConfig = doTestBefore(configRef.current);
                        if (result) {
                            result = await DataUtil.applyFilterAsync(result, testConfig?.filter);
                            if (result != null) {
                                testResultRef.current = JSON.stringify(result, null, 2);
                                doTestAfter && doTestAfter(result);
                            }
                        } else {
                            testResultRef.current = JSON.stringify({msg: '请求错误'}, null, 2);
                            doTestAfter && doTestAfter(null);
                            globalMessage.messageApi?.warning('测试未通过');
                        }
                    }).catch((e) => {
                        console.error('请求测试失败', e)
                    }).finally(() => {
                        setCount(count + 1);
                    })
                })
            }
        })
    }

    const doSave = () => {
        if (!configRef.current?.commonApiId) {
            globalMessage.messageApi?.error('请先选择一个公共API');
            return;
        }
        onSave(configRef.current, SafeEvalUtil.run(testResultRef.current))
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {reRender, id, dataFragment} = fieldChangeData;
        if (id === 'doTest')
            doTest();
        else if (id === 'doSave')
            doSave();
        else
            configRef.current = ObjectUtil.merge(configRef.current, dataFragment)
        if (reRender)
            setCount(count + 1);
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    );
}
