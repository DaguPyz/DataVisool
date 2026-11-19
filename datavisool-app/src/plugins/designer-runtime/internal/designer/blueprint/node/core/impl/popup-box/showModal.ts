/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createElement} from "react";
import {createRoot} from "react-dom/client";
import type DesignerManager from "@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts";
import type {BPPopupBoxNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {registerBlueprintRuntimeCleanup} from '@/plugins/designer-runtime/internal/designer/blueprint/core/BlueprintRuntimeResources.ts';

type ModalRenderOptions = Pick<BPPopupBoxNodeConfig, 'background' | 'title' | 'titleColor' | 'nodeId'>;

const calculateModalSize = (options: ModalRenderOptions, designerManager: DesignerManager) => {
    const {nodeId} = options;
    const {layerConfigs} = designerManager.layerManager;
    const layer = layerConfigs[nodeId];
    if (!layer)
        return {width: 500, height: 500, x: 0, y: 0};
    let width = 500, height = 500, x = 0, y = 0;
    if (layer.type === 'group') {
        const bounds = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
        const visited = new Set<string>();
        const group = layerConfigs[nodeId];
        const visitSiblings = (firstId?: string) => {
            let id = firstId;
            while (id && !visited.has(id)) {
                const child = layerConfigs[id];
                if (!child) return;
                visited.add(id);
                if (child.type !== 'group') {
                    bounds.minX = Math.min(bounds.minX, child.x ?? Infinity);
                    bounds.minY = Math.min(bounds.minY, child.y ?? Infinity);
                    bounds.maxX = Math.max(bounds.maxX, (child.x ?? -Infinity) + (child.width ?? 0));
                    bounds.maxY = Math.max(bounds.maxY, (child.y ?? -Infinity) + (child.height ?? 0));
                }
                if (child.childHeader) visitSiblings(child.childHeader);
                id = child.next;
            }
        };
        visitSiblings(group?.childHeader);
        const groupBox = Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY)
            ? {minX: bounds.minX, minY: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY}
            : {minX: 0, minY: 0, width: 0, height: 0};
        width = groupBox.width;
        height = groupBox.height;
        x = groupBox.minX;
        y = groupBox.minY;
    } else {
        width = layer.width!;
        height = layer.height!;
        x = layer.x!;
        y = layer.y!;
    }
    return {width, height, x, y};
};

export const showModal = (options: ModalRenderOptions, designerManager: DesignerManager, isActive: () => boolean = () => designerManager.isRuntimeEffectActive()) => {
    if (!isActive()) return;
    const {width, height, x, y} = calculateModalSize(options, designerManager);
    void import('./ModalRenderUtil.tsx').then(({ModalWrapper}) => {
        if (!isActive()) return;
        const container = document.createElement('div');
        container.setAttribute('data-datavisool-i18n-skip', 'true');
        const root = createRoot(container);
        let destroyed = false;
        let unregister: () => void = () => {};
        const destroy = () => {
            if (destroyed) return;
            destroyed = true;
            try { root.unmount(); }
            finally {
                try { container.remove(); }
                finally { unregister(); }
            }
        };
        unregister = registerBlueprintRuntimeCleanup(designerManager, destroy);

        try {
            document.body.appendChild(container);
            root.render(
                createElement(ModalWrapper, {
                    options,
                    designerManager,
                    size: {width, height, x, y},
                    onDestroy: destroy
                })
            );
        } catch (error) {
            try {
                destroy();
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'Failed to render and clean up blueprint popup.');
            }
            throw error;
        }
    }).catch(error => console.error('打开蓝图弹框失败', error));
};
