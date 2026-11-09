/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from "react";
import {createRoot} from "react-dom/client";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import {BPPopupBoxNodeConfigType} from "./BPPopupBoxNodeController.ts";
import CoordinateUtil from "@/util/CoordinateUtil.ts";
import {ModalWrapper} from "./ModalRenderUtil.tsx";

type ModalRenderOptions = Pick<BPPopupBoxNodeConfigType, 'background' | 'title' | 'titleColor' | 'nodeId'>;

const calculateModalSize = (options: ModalRenderOptions, designerManager: DesignerManager) => {
    const {nodeId} = options;
    const {layerConfigs} = designerManager.layerManager;
    const layer = layerConfigs[nodeId];
    if (!layer)
        return {width: 500, height: 500, x: 0, y: 0};
    let width = 500, height = 500, x = 0, y = 0;
    if (layer.type === 'group') {
        const groupBox = CoordinateUtil.calculateGroupLayerRect(nodeId, layerConfigs);
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

export const showModal = (options: ModalRenderOptions, designerManager: DesignerManager) => {
    const container = document.createElement('div');
    container.setAttribute('data-datavisool-i18n-skip', 'true');
    document.body.appendChild(container);

    const {width, height, x, y} = calculateModalSize(options, designerManager);
    const root = createRoot(container);
    const destroy = () => {
        root.unmount();
        container.remove();
    };

    root.render(
        React.createElement(ModalWrapper, {
            options,
            designerManager,
            size: {width, height, x, y},
            onDestroy: destroy
        })
    );
};
