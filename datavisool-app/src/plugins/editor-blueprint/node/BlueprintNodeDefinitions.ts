/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType} from 'react';
import {CodeBrackets, ConnectionPoint, ConnectionPointTwo, Fork, Globe, LinkTwo, MessageOne, PreviewOpen, Ring, Stopwatch} from '@icon-park/react';
import type {BlueprintNodeConfigProps} from './BlueprintNodeConfigProps.ts';
import {ConditionNodeConfig} from './configs/ConditionNodeConfig.tsx';
import {LogicalProcessNodeConfig} from './configs/LogicalProcessNodeConfig.tsx';
import {MqttNodeConfig} from './configs/MqttNodeConfig.tsx';
import {PopupBoxNodeConfig} from './configs/PopupBoxNodeConfig.tsx';
import {TimerNodeConfig} from './configs/TimerNodeConfig.tsx';
import {VisibleNodeConfig} from './configs/VisibleNodeConfig.tsx';
import {WebSocketNodeConfig} from './configs/WebSocketNodeConfig.tsx';

export interface BlueprintNodePresentation {
    readonly color: string;
    readonly icon: ComponentType<{size?: number}>;
    readonly editableTitle?: boolean;
    readonly ConfigView?: ComponentType<BlueprintNodeConfigProps>;
}

/** Editor-only visual and configuration metadata keyed by the persisted node layout type. */
export const blueprintNodePresentations: Readonly<Record<string, BlueprintNodePresentation>> = {
    BPGlobalNode: {color: '#2d8e00', icon: Globe, editableTitle: true},
    BPGlobalVariableNode: {color: '#ff8200', icon: CodeBrackets},
    BPLayerNode: {color: '#247057', icon: ConnectionPoint},
    BPConditionNode: {color: '#247ba6', icon: Fork, editableTitle: true, ConfigView: ConditionNodeConfig},
    BPLogicalProcessNode: {color: '#a62469', icon: Ring, editableTitle: true, ConfigView: LogicalProcessNodeConfig},
    BPMqttNode: {color: '#ec00ff', icon: ConnectionPointTwo, editableTitle: true, ConfigView: MqttNodeConfig},
    BPPopupBoxNode: {color: '#154f73', icon: MessageOne, editableTitle: true, ConfigView: PopupBoxNodeConfig},
    BPTimerNode: {color: '#302788', icon: Stopwatch, editableTitle: true, ConfigView: TimerNodeConfig},
    BPVisibleNode: {color: '#8c5f5f', icon: PreviewOpen, editableTitle: true, ConfigView: VisibleNodeConfig},
    BPWebSocketNode: {color: '#c86500', icon: LinkTwo, editableTitle: true, ConfigView: WebSocketNodeConfig},
};
