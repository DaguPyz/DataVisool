/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {NodeInfoType} from '@datavisool/sdk/types';
import type {DesignerBlueprintNodeMetadataContext, DesignerBlueprintNodeRegistry, EditorBlueprintNodeController} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import type {AbstractBPNodeController} from './core/AbstractBPNodeController.ts';
import BPConditionNodeController from './core/impl/condition/BPConditionNodeController.ts';
import BPGlobalVariableNodeController from './core/impl/global-variable/BPGlobalVariableNodeController.ts';
import BPGlobalNodeController from './core/impl/global/BPGlobalNodeController.ts';
import BPLayerNodeController from './core/impl/layer/BPLayerNodeController.ts';
import BPLogicalProcessNodeController from './core/impl/logical-process/BPLogicalProcessNodeController.ts';
import BPMqttNodeController from './core/impl/mqtt/BPMqttNodeController.ts';
import BPPopupBoxNodeController from './core/impl/popup-box/BPPopupBoxNodeController.ts';
import BPTimerNodeController from './core/impl/timer/BPTimerNodeController.ts';
import BPVisibleNodeController from './core/impl/visible/BPVisibleNodeController.ts';
import BPWebSocketNodeController from './core/impl/websocket/BPWebSocketNodeController.ts';

type RuntimeController = AbstractBPNodeController<any> & EditorBlueprintNodeController;
type ControllerConstructor = new (config?: any, metadata?: DesignerBlueprintNodeMetadataContext) => RuntimeController;

/** Persisted layout type keys are intentionally listed explicitly; never derive them from filenames. */
export const blueprintControllerConstructors: Readonly<Record<string, ControllerConstructor>> = Object.freeze({
    BPGlobalNode: BPGlobalNodeController,
    BPGlobalVariableNode: BPGlobalVariableNodeController,
    BPLayerNode: BPLayerNodeController,
    BPConditionNode: BPConditionNodeController,
    BPLogicalProcessNode: BPLogicalProcessNodeController,
    BPMqttNode: BPMqttNodeController,
    BPPopupBoxNode: BPPopupBoxNodeController,
    BPTimerNode: BPTimerNodeController,
    BPVisibleNode: BPVisibleNodeController,
    BPWebSocketNode: BPWebSocketNodeController,
});

function abortError(): Error {
    return Object.assign(new Error('Designer runtime stopped before blueprint node creation'), {name: 'AbortError'});
}

export function createDesignerBlueprintNodeRegistry(isActive: () => boolean = () => true): DesignerBlueprintNodeRegistry {
    const definitions = Object.freeze(Object.entries(blueprintControllerConstructors).map(([type, Controller]) => Object.freeze({
        type,
        createController(config?: NodeInfoType, metadata?: DesignerBlueprintNodeMetadataContext) {
            if (!isActive() || (metadata && !metadata.isActive()))
                throw abortError();
            return new Controller(config, metadata);
        },
    })));
    const byType = new Map(definitions.map(definition => [definition.type, definition]));
    return {
        get(type) { return isActive() ? byType.get(type) : undefined; },
        list() { return isActive() ? definitions : []; },
    };
}
