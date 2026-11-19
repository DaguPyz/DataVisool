/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import React, {useEffect, useState} from 'react';
import './BPNodeContainer.less';
import type {BPNodeLayoutType, NodeInfoType} from '@datavisool/sdk/types';
import type {EditorBlueprintNodeController} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {useBlueprintNodeRegistry} from './BlueprintNodeRegistryContext.tsx';
import {blueprintNodePresentations} from './BlueprintNodeDefinitions.ts';
import BPNode from './BPNode.tsx';
import {normalizeBlueprintNodeConfig} from '@/plugins/editor-blueprint/util/BlueprintNodeUIUtil.ts';
import {useEditorBlueprintSession} from '../session/EditorBlueprintSessionContext.tsx';

export interface BPNodeContainerProps {
    layout: BPNodeLayoutType;
}

export const BPNodeContainer: React.FC<BPNodeContainerProps> = React.memo(({layout}) => {
    const registry = useBlueprintNodeRegistry();
    const [controller, setController] = useState<EditorBlueprintNodeController | null>(null);
    const session = useEditorBlueprintSession();
    const manager = session;
    const pageManager = session.currentPageManager;

    useEffect(() => {
        const type = layout.type;
        const id = layout.id;
        if (!type || !id || !pageManager || !manager || !manager.isActive())
            return;

        const definition = registry.get(type);
        if (!definition) {
            console.warn(`[BPNodeContainer] missing blueprint controller for type="${type}"`);
            return;
        }

        const nodeController = definition.createController(undefined, session.scene.blueprintNodeMetadata);
        const config = normalizeBlueprintNodeConfig(
            pageManager.bpNodeConfigMap?.[id] ?? nodeController.getNodeInfo(id),
        ) as NodeInfoType | null;
        if (!config) {
            manager.destroyController(nodeController);
            return;
        }
        const {bpAPMap = {}} = pageManager;
        [...(config.input ?? []), ...(config.output ?? [])].forEach(anchor => {
            const anchorId = anchor.id!;
            if (bpAPMap[anchorId] !== undefined) {
                anchor.used = true;
                return;
            }
            anchor.used = Object.values(bpAPMap).some(value => Array.isArray(value)
                ? value.includes(anchorId)
                : value === anchorId);
        });

        nodeController.update(config);
        manager.setControllerConfig(id, config);
        manager.registerController(id, nodeController);
        setController(nodeController);

        return () => {
            if (manager.currPageNodeControllers[id] === nodeController)
                manager.unregisterController(id, nodeController);
            else
                manager.destroyController(nodeController);
        };
    }, [layout.id, layout.type, manager, pageManager?.pageId, registry]);

    const {position, id, type} = layout;
    const presentation = type ? blueprintNodePresentations[type] : undefined;

    return (
        <div className="bp-node-container" data-nid={id}
             onDoubleClick={() => {
                 session.rightStore.setActiveNode(id ?? null);
                 session.workspaceUIStore.openRight();
             }}
             style={{transform: `translate(${position?.x ?? 0}px,${position?.y ?? 0}px)`}}>
            {controller && presentation && <BPNode controller={controller} icon={presentation.icon}
                                                    titleBgColor={presentation.color}
                                                    editableTitle={presentation.editableTitle}/>} 
        </div>
    );
});
