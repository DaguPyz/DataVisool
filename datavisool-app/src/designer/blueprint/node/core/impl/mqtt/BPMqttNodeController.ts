/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController";
import BPNode, {NodeProps} from "@/designer/blueprint/node/BPNode";
import React from "react";
import {ObjectUtil} from "@datavisool/sdk";
import {MqttNodeConfig} from "./MqttNodeConfig.tsx";
import {IBPTaskInfo} from "@/designer/blueprint/IBPTyps.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {ConnectionPointTwo} from "@icon-park/react";
import {IMQTTConfig} from "@datavisool/sdk/types";
import mqtt, {IClientOptions, MqttClient} from "mqtt";
import DataUtil from "@/util/DataUtil.ts";

export interface BPMqttNodeProps extends NodeInfoType {
    nodeConfig: IMQTTConfig;
}

export default class BPMqttNodeController extends AbstractBPNodeController<BPMqttNodeProps> {

    private mqttClient: MqttClient | null = null;
    private clientVersion = 0;
    private disposed = false;

    private isCurrentClient(client: MqttClient, clientVersion: number): boolean {
        return !this.disposed && this.mqttClient === client && this.clientVersion === clientVersion;
    }

    async create(container: HTMLElement, config: BPMqttNodeProps): Promise<void> {
        this.disposed = false;
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender<any, NodeProps>(container, BPNode, {
            ...config,
            titleBgColor: "#ec00ff",
            titleChanger: (v) => this.config!.name = v,
            icon: ConnectionPointTwo
        });
    }

    private doConnect(taskInfo: IBPTaskInfo, params: any): boolean {
        const {nodeId, task, designerManager} = taskInfo;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {host, path = '/mqtt', port, topics, qos = 0, filter, ...rest} = this.config?.nodeConfig ?? {};
        if (!host || !port || !topics) {
            console.error('MQTT配置信息缺失');
            return false;
        }
        const clientVersion = ++this.clientVersion;
        this.mqttClient?.end();
        const client = mqtt.connect(`${host}:${port}${path}`, ObjectUtil.removeEmptyKeys(rest) as IClientOptions);
        this.mqttClient = client;
        if (this.isCurrentClient(client, clientVersion)) {
            const newApId = nodeId + ':connect:' + AnchorPointType.OUTPUT;
            task.run(newApId, task, designerManager, params);
        }
        return this.isCurrentClient(client, clientVersion);
    }

    execute(taskInfo: IBPTaskInfo, params: any): void {
        const {nodeId, apId, anchorType, task, designerManager} = taskInfo;
        if (anchorType === AnchorPointType.OUTPUT)
            return;
        if (apId === 'subscribe') {
            if (!this.mqttClient)
                this.doConnect(taskInfo, params);
            if (this.mqttClient) {
                const {topics, filter, qos = 0} = this.config?.nodeConfig ?? {};
                const client = this.mqttClient;
                const clientVersion = this.clientVersion;
                client.subscribe(topics?.replaceAll('\\s', '').split(',') ?? [], {qos}, (err) => {
                    if (!this.isCurrentClient(client, clientVersion))
                        return;
                    if (err) {
                        console.warn('无法订阅该服务器' + err.message, this.config?.nodeConfig);
                    } else {
                        client.on('message', async (topic, message) => {
                            if (!this.isCurrentClient(client, clientVersion))
                                return;
                            let data: any = {
                                topic,
                                message: message.toString()
                            }
                            data = await DataUtil.applyFilterAsync(data, filter);
                            if (!this.isCurrentClient(client, clientVersion))
                                return;
                            const newApId = nodeId + ':message:' + AnchorPointType.OUTPUT;
                            task.run(newApId, task, designerManager, data);
                        })
                    }
                })
                client.on("close", () => {
                    if (!this.isCurrentClient(client, clientVersion))
                        return;
                    const newApId = nodeId + ':close:' + AnchorPointType.OUTPUT;
                    task.run(newApId, task, designerManager, params);
                })
            }
        }
        if (apId === 'publish') {
            if (!this.mqttClient)
                this.doConnect(taskInfo, params);
            if (!this.mqttClient) {
                console.warn('MQTT服务器未连接', this.config?.nodeConfig);
                return;
            }
            const topics = this.config?.nodeConfig.topics;
            if (!topics) {
                console.warn('bp execute warning. topic is empty');
                return;
            } else {
                const client = this.mqttClient;
                const clientVersion = this.clientVersion;
                if (!client || !this.isCurrentClient(client, clientVersion))
                    return;
                const data = typeof params === 'string' ? params : JSON.stringify(params);
                const topicArr = topics?.split(",");
                topicArr?.forEach(topic => {
                    topic = topic.trim();
                    client.publish(topic, data)
                })
            }
        }
    }

    getConfig(): BPMqttNodeProps | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return {
            id: nodeId,
            name: "MQTT",
            type: "BPMqttNode",
            input: [
                {
                    id: nodeId + ':subscribe:' + AnchorPointType.INPUT,
                    name: "订阅主题",
                    type: AnchorPointType.INPUT
                },
                {
                    id: nodeId + ':publish:' + AnchorPointType.INPUT,
                    name: "发送数据",
                    type: AnchorPointType.INPUT
                }
            ],
            output: [
                {
                    id: nodeId + ":connect:" + AnchorPointType.OUTPUT,
                    name: "打开连接时",
                    type: AnchorPointType.OUTPUT
                },
                {
                    id: nodeId + ":message:" + AnchorPointType.OUTPUT,
                    name: "接收数据时",
                    type: AnchorPointType.OUTPUT
                },
                {
                    id: nodeId + ":close:" + AnchorPointType.OUTPUT,
                    name: "连接关闭时",
                    type: AnchorPointType.OUTPUT
                },
            ]
        };
    }

    getConfigComponent(): React.ComponentType | null {
        return MqttNodeConfig;
    }

    destroy(): void {
        this.disposed = true;
        this.clientVersion += 1;
        this.mqttClient?.end();
        this.mqttClient = null;
        super.destroy();
    }

}
