/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useRef, useState} from "react";
import {Control, FieldChangeData, globalMessage, DatavisoolGUI} from "@datavisool/ui";
import {ObjectUtil} from "@datavisool/sdk";
import {IWebSocketConfig} from "@datavisool/sdk/types";
import {cloneDeep} from "lodash";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";
import DataUtil from "@/util/DataUtil.ts";

export interface WebSocketConfigProps {
    data: IWebSocketConfig;
    doTestBefore?: (config: IWebSocketConfig) => IWebSocketConfig;
    doTestAfter?: (data: any) => any;
    /**
     * @param config 配置数据
     * @param testData 测试数据
     */
    onSave: (config: IWebSocketConfig, testData?: any) => void;
}

const defaultConfig: IWebSocketConfig = {
    url: '',
    protocols: '',
    filter: undefined,
}

export function WebSocketConfig(props: WebSocketConfigProps) {
    const {data, onSave, doTestBefore, doTestAfter} = props;
    const dataRef = useRef<IWebSocketConfig>(ObjectUtil.merge(cloneDeep(defaultConfig), data));
    const testResRef = useRef<string>("")
    const wsRef = useRef<WebSocket | null>(null);
    const [count, setCount] = useState(0);

    const schema: Control = {
        type: 'grid',
        config: {gridGap: '10px'},
        children: [
            {
                key: 'url',
                type: 'input',
                label: 'WS地址',
                value: dataRef.current?.url || '',
            },
            {
                key: 'protocols',
                type: 'input',
                tip: '多个子协议用","分割，不填写则使用默认的ws协议进行链接',
                label: '子协议',
                value: dataRef.current?.protocols || '',
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
                            height: 250,
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
                        id: 'testRes',
                        type: 'code-editor',
                        config: {
                            readonly: true,
                            height: 250,
                        },
                        reRender: true,
                        value: testResRef.current,
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
            globalMessage.messageApi?.error('WebSocket链接地址不能为空');
            return false;
        }
        return true;
    }

    const doTest = () => {
        if (wsRef.current)
            wsRef.current.close();
        if (!validate())
            return;
        let testConfig = dataRef.current;
        if (doTestBefore)
            testConfig = doTestBefore(dataRef.current);
        const protocols = testConfig.protocols && testConfig.protocols.length > 0 ? testConfig.protocols?.split(',').map(item => item.trim()) : [];
        wsRef.current = new WebSocket(testConfig.url!, protocols);
        wsRef.current.onopen = () => globalMessage.messageApi?.info('连接成功')
        wsRef.current.onerror = () => globalMessage.messageApi?.error('连接错误')
        wsRef.current.onmessage = async (event) => {
            let data = event.data;
            data = await DataUtil.applyFilterAsync(data, testConfig.filter);
            if (data != null) {
                doTestAfter && doTestAfter(data)
                testResRef.current = JSON.stringify(data, null, 2);
                setCount((prev) => prev + 1);
            }
        }
    }

    const doSave = () => {
        if (!validate())
            return;
        wsRef.current?.close();
        onSave(dataRef.current, SafeEvalUtil.run(testResRef.current));
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {reRender, id, dataFragment} = fieldChangeData;
        if (id === 'doTest')
            doTest();
        else if (id === 'doSave')
            doSave();
        else if (id === 'testRes')
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
