/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useRef, useState} from "react";
import {Control, FieldChangeData, globalMessage, DatavisoolGUI} from "@datavisool/ui";
import {ObjectUtil} from "@datavisool/sdk";
import {IMQTTConfig} from "@datavisool/sdk/types";
import mqtt, {IClientOptions, MqttClient} from "mqtt";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";
import DataUtil from "@/util/DataUtil.ts";
import {parseMqttTopics} from "@/util/MqttTopics.ts";

export interface MQTTConfigProps {
    data: IMQTTConfig;
    doTestBefore?: (config: IMQTTConfig) => IMQTTConfig;
    doTestAfter?: (data: any) => any;
    /**
     * @param config 配置数据
     * @param testData 测试数据
     */
    onSave: (config: IMQTTConfig, testData?: any) => void;
}

export function MQTTConfig(props: MQTTConfigProps) {
    const {data, doTestBefore, onSave, doTestAfter} = props;
    const dataRef = useRef<IMQTTConfig>({...data});
    const testResRef = useRef<string>("")
    const mqttRef = useRef<MqttClient | null>(null);
    const [count, setCount] = useState(0);
    const mqttClientRef = useRef<MqttClient | null>(null);

    const schema: Control = {
        type: 'grid',
        config: {gridGap: '10px'},
        children: [
            {
                type: 'sub-accordion',
                label: '通用',
                config: {defaultActive: true},
                children: [
                    {
                        type: 'grid',
                        config: {gridGap: '10px'},
                        children: [
                            {
                                key: 'host',
                                type: 'input',
                                label: '地址',
                                value: dataRef.current?.host || '',
                            },
                            {
                                key: 'port',
                                type: 'number-input',
                                label: '端口',
                                value: dataRef.current?.port || '',
                            },
                            {
                                key: 'path',
                                type: 'input',
                                label: '子路径',
                                value: dataRef.current?.path || '',
                            },
                            {
                                key: 'clientId',
                                type: 'input',
                                label: '客户端ID',
                                value: dataRef.current?.clientId || '',
                            },
                            {
                                key: 'username',
                                type: 'input',
                                label: '用户名',
                                value: dataRef.current?.username || '',
                            },
                            {
                                key: 'password',
                                type: 'input',
                                label: '密码',
                                value: dataRef.current?.password || '',
                            },
                            {
                                key: 'topics',
                                type: 'input',
                                label: '主题',
                                tip: "多个主题之间使用“,”隔开，主题两端的空格会被忽略",
                                value: dataRef.current?.topics || '',
                            },
                            {
                                key: 'qos',
                                type: 'select',
                                label: 'Qos',
                                value: dataRef.current?.qos || '0',
                                config: {
                                    options: [
                                        {label: '0', value: 0},
                                        {label: '1', value: 1},
                                        {label: '2', value: 2},
                                    ]
                                }
                            }
                        ]
                    }
                ]
            },
            {
                type: 'sub-accordion',
                label: '高级',
                children: [
                    {
                        type: 'grid',
                        config: {gridGap: '10px'},
                        children: [
                            {
                                key: 'connectTimeout',
                                type: 'number-input',
                                label: '超时时间',
                                value: dataRef.current?.connectTimeout || '',
                            },
                            {
                                key: 'keepalive',
                                type: 'number-input',
                                label: '心跳间隔',
                                value: dataRef.current?.keepalive || '',
                            },
                            {
                                key: 'clean',
                                type: 'switch',
                                label: '清除会话',
                                value: dataRef.current?.clean || '',
                            },
                            {
                                key: 'reconnectPeriod',
                                type: 'number-input',
                                label: '自动重连',
                                value: dataRef.current?.reconnectPeriod || '',
                            },
                            {
                                key: 'protocolVersion',
                                type: 'select',
                                label: '协议版本',
                                tip: "协议版本：4 = MQTT 3.1.1，5 = MQTT 5.0（mqtt.js 默认 4）",
                                value: dataRef.current?.protocolVersion || '',
                                config: {
                                    options: [
                                        {
                                            value: 4,
                                            label: 'MQTT 3.1.1'
                                        },
                                        {
                                            value: 5,
                                            label: 'MQTT 5.0'
                                        }
                                    ]
                                }
                            }
                        ]
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
                            height: 150,
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
                            height: 150,
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
        if (!dataRef.current?.host) {
            globalMessage.messageApi?.error('MQTT服务器地址不能为空');
            return false;
        }
        if (!dataRef.current?.topics) {
            globalMessage.messageApi?.error('主题不能为空');
            return false;
        }
        return true;
    }

    const doTest = () => {
        if (mqttRef.current)
            mqttRef.current.end();
        if (!validate())
            return;
        let testConfig = dataRef.current;
        if (doTestBefore)
            testConfig = doTestBefore(dataRef.current);
        const {host, path = '/mqtt', port, topics, qos = 0, filter, ...rest} = testConfig;
        if (!host || !port || !topics) {
            globalMessage.messageApi?.error('请填写完整的MQTT链接地址、端口和主题');
            return;
        }
        mqttClientRef.current?.end();
        globalMessage.messageApi?.open({key: "connectMqttServer", type: 'loading', content: '正在连接服务器...'})
        mqttClientRef.current = mqtt.connect(`${host}:${port}${path}`, ObjectUtil.removeEmptyKeys(rest) as IClientOptions);
        if (mqttClientRef.current) {
            mqttClientRef.current.subscribe(parseMqttTopics(topics), {qos}, (err) => {
                globalMessage.messageApi?.destroy("connectMqttServer");
                if (err) {
                    globalMessage.messageApi?.error('无法订阅该服务器' + err.message);
                } else {
                    globalMessage.messageApi?.success(`${topics} - 订阅成功`);
                    mqttClientRef.current!.on('message', async (topic, message) => {
                        let data: any = {
                            topic,
                            message: message.toString()
                        }
                        data = await DataUtil.applyFilterAsync(data, filter);
                        if (data != null) {
                            doTestAfter && doTestAfter(data)
                            testResRef.current = JSON.stringify(data, null, 2);
                            setCount((prev) => prev + 1);
                        }
                    })
                }
            })
        }
    }


    const doSave = () => {
        if (!validate())
            return;
        mqttRef.current?.end();
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
