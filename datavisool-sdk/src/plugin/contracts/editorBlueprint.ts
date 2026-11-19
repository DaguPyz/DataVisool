/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {IMQTTConfig, IWebSocketConfig, NodeInfoType, UpdateOptions} from '../../types.js';

export interface BPConditionNodeConfig extends NodeInfoType {
    handler?: string;
}

export interface BPGlobalVariableConfig extends NodeInfoType {}

export interface BPLogicalProcessNodeConfig extends NodeInfoType {
    handler?: string;
}

export interface BPMqttNodeConfig extends NodeInfoType {
    nodeConfig: IMQTTConfig;
}

export interface BPPopupBoxNodeConfig extends NodeInfoType {
    nodeId: string;
    title: string;
    titleColor: string;
    background: string;
}

export interface BPTimerNodeConfig extends NodeInfoType {
    interval?: number;
    loop?: boolean;
}

export interface BPVisibleNodeConfig extends NodeInfoType {
    nodeConfig: {nodeIds: string[]};
}

export interface BPWebSocketNodeConfig extends NodeInfoType {
    nodeConfig: IWebSocketConfig;
}

/** Narrow controller shape consumed by editor-owned blueprint views. */
export interface EditorBlueprintNodeController {
    getConfig(): NodeInfoType | null;
    getNodeInfo(nodeId?: string): NodeInfoType | null;
    update(config: object, options?: UpdateOptions): void;
    subscribe(listener: () => void): () => void;
    destroy(): void;
}

/** Narrow write/read API passed to a node's private configuration view. */
export type EditorBlueprintNodeConfigFacade = Pick<
    EditorBlueprintNodeController,
    'getConfig' | 'update' | 'subscribe'
>;

/** Scene-bound metadata reader passed as DTO; it never exposes a host Manager. */
export interface DesignerBlueprintNodeMetadataContext {
    isActive(): boolean;
    readNodeInfo(type: 'BPLayerNode' | 'BPGlobalVariableNode', nodeId: string): NodeInfoType | null;
}

/** A stable persisted layout type mapped to a runtime controller factory. */
export interface DesignerBlueprintNodeDefinition {
    readonly type: string;
    createController(config?: NodeInfoType, metadata?: DesignerBlueprintNodeMetadataContext): EditorBlueprintNodeController;
}

export interface DesignerBlueprintNodeRegistry {
    get(type: string): DesignerBlueprintNodeDefinition | undefined;
    list(): readonly DesignerBlueprintNodeDefinition[];
}
