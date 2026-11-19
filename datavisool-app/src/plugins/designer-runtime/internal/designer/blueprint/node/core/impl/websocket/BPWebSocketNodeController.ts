/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController";
import type {BPWebSocketNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import DataUtil from "@/util/DataUtil.ts";


export default class BPWebSocketNodeController extends AbstractBPNodeController<BPWebSocketNodeConfig> {

    private webSocket: WebSocket | null = null;
    private connectionVersion = 0;
    private disposed = false;

    private isCurrentSocket(socket: WebSocket, connectionVersion: number): boolean {
        return !this.disposed && this.webSocket === socket && this.connectionVersion === connectionVersion;
    }


    execute(taskInfo: IBPTaskInfo, params: any): void {
        const {nodeId, apId, anchorType, task, designerManager} = taskInfo;
        if (anchorType === AnchorPointType.OUTPUT)
            return;
        if (apId === 'init') {
            this.webSocket?.close();
            const {url, protocols, filter} = this.config?.nodeConfig ?? {};
            if (!url) {
                console.error('WebSocket url is empty');
                return;
            }
            const protocolsArr = protocols && protocols.length > 0 ? protocols?.split(',').map(item => item.trim()) : [];
            const connectionVersion = ++this.connectionVersion;
            const socket = new WebSocket(url, protocolsArr);
            this.webSocket = socket;
            socket.onopen = () => {
                if (!this.isCurrentSocket(socket, connectionVersion))
                    return;
                const newApId = nodeId + ':onOpen:' + AnchorPointType.OUTPUT;
                task.run(newApId, task, designerManager, params);
            }
            socket.onmessage = async (e) => {
                if (!this.isCurrentSocket(socket, connectionVersion))
                    return;
                const data = await DataUtil.applyFilterAsync(e.data, filter);
                if (!this.isCurrentSocket(socket, connectionVersion))
                    return;
                const newApId = nodeId + ':onMessage:' + AnchorPointType.OUTPUT;
                task.run(newApId, task, designerManager, data);
            }
            socket.onclose = () => {
                if (!this.isCurrentSocket(socket, connectionVersion))
                    return;
                const newApId = nodeId + ':onClose:' + AnchorPointType.OUTPUT;
                task.run(newApId, task, designerManager, params);
            }
        }
        if (apId === 'send') {
            const result = JSON.stringify(params);
            if (!this.disposed)
                this.webSocket?.send(result);
        }
    }

    getConfig(): BPWebSocketNodeConfig | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return {
            id: nodeId,
            name: "WebSocket",
            type: "BPWebSocketNode",
            input: [
                {
                    id: nodeId + ':init:' + AnchorPointType.INPUT,
                    name: "初始化",
                    type: AnchorPointType.INPUT
                },
                {
                    id: nodeId + ':send:' + AnchorPointType.INPUT,
                    name: "发送数据",
                    type: AnchorPointType.INPUT
                }
            ],
            output: [
                {
                    id: nodeId + ":onOpen:" + AnchorPointType.OUTPUT,
                    name: "打开连接时",
                    type: AnchorPointType.OUTPUT
                },
                {
                    id: nodeId + ":onMessage:" + AnchorPointType.OUTPUT,
                    name: "接收数据时",
                    type: AnchorPointType.OUTPUT
                },
                {
                    id: nodeId + ":onClose:" + AnchorPointType.OUTPUT,
                    name: "连接关闭时",
                    type: AnchorPointType.OUTPUT
                },
            ]
        };
    }


    destroy(): void {
        this.disposed = true;
        this.connectionVersion += 1;
        let cleanupFailed = false;
        let cleanupError: unknown;
        try { this.webSocket?.close(); } catch (error) { cleanupFailed = true; cleanupError = error; }
        this.webSocket = null;
        super.destroy();
        if (cleanupFailed) throw cleanupError;
    }

}
