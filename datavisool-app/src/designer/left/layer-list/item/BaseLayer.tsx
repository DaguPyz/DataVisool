/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {ChangeEvent, MouseEvent} from "react";
import layerListStore from "@/designer/left/layer-list/LayerListStore";
import contextMenuStore from "@/designer/event/ContextMenuStore.ts";
import rightStore from "@/designer/right/RightStore.ts";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";

export interface LayerDragHandleProps {
    onDragHandleMouseDown?: (layerId: string, event: React.MouseEvent<HTMLDivElement>) => void;
}

export interface LayerProps {
    compId?: string;
    name?: string;
    lock?: boolean;
    hide?: boolean;
    selected?: boolean;
    type?: string;
    inputMode?: boolean;
    children?: React.ReactNode;
}

export abstract class BaseLayer extends React.PureComponent<LayerProps & LayerDragHandleProps, LayerProps & { showContent?: boolean }> {

    layerName: string = '';

    domRef: HTMLDivElement | null = null;

    constructor(props: LayerProps) {
        super(props);
        this.state = {...props};
        this.layerName = props.name || '';
    }

    /**
     * 由于图层列表的操作事件阻止了冒泡，因此通过本方法单独判断是否需要关闭图层列表上打开的右键菜单
     */
    closeContextMenu = () => {
        const {canvasMenuVisible, updateCanvasMenuVisible} = contextMenuStore;
        if (canvasMenuVisible)
            updateCanvasMenuVisible(false);
    }

    toggleLock = (event: MouseEvent) => {
        event.stopPropagation();
        const {lockChange} = layerListStore;
        lockChange && lockChange(this.state.compId!, !this.state.lock);
        this.closeContextMenu();
    }

    toggleHide = (event: MouseEvent) => {
        event.stopPropagation();
        const {hideChange} = layerListStore;
        hideChange && hideChange(this.state.compId!, !this.state.hide);
        this.closeContextMenu();
    }

    onSelected = (event: MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
        const {compId} = this.state;
        event.stopPropagation();
        const {selectedChange} = layerListStore;
        const selectedIds = selectedChange ? selectedChange(compId!, event) : [];
        this.syncActiveComponentConfig(selectedIds);
        this.closeContextMenu();
    }

    openInput = (event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        const {inputMode} = this.state;
        if (!inputMode)
            this.setState({inputMode: true});
        this.closeContextMenu();
    }

    syncActiveComponentConfig = (selectedIds: string[]) => {
        const {compId} = this.state;
        const {activeElem, activeConfig} = rightStore;
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager!;
        if (selectedIds.includes(compId!)) {
            const layer = layerConfigs[compId!];
            if (compId !== activeElem.id)
                activeConfig(compId!, layer.type!, 'layer-list');
            return;
        }
        if (activeElem.id && selectedIds.includes(activeElem.id))
            return;
        if (selectedIds.length === 1) {
            const remainingLayer = layerConfigs[selectedIds[0]];
            if (remainingLayer)
                activeConfig(selectedIds[0], remainingLayer.type!, 'layer-list');
            return;
        }
        activeConfig(null, "");
    }

    closeInput = () => {
        const {inputMode, compId, name} = this.state;
        if (inputMode && name !== this.layerName) {
            const {updateLayer, controllers} = window.DATAVISOOL_ENV.currentManager.layerManager;
            updateLayer([{id: compId!, name: this.layerName}]);
            const compInstance = controllers[compId!];
            compInstance && compInstance.update({base: {name: this.layerName}}, {reRender: false});
            this.setState({inputMode: false, name: this.layerName});
        } else {
            this.setState({inputMode: false});
        }
    }

    changeLayerName = (event: ChangeEvent<HTMLInputElement>) => {
        this.layerName = event.target.value;
    }

    changeHide = (hide: boolean) => {
        this.setState({
            hide,
            selected: eventOperateStore.targetIds.includes(this.state.compId!),
        });
        const {type, compId} = this.props;
        if (type === 'group') {
            if (window.DATAVISOOL_ENV.currentManager.layerManager?.layerConfigs) {
                const childLayers = Object.values(window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs).filter(layer => layer?.pid === compId);
                const {layerInstances} = layerListStore;
                childLayers.forEach(layer => {
                    const instance = layerInstances[layer.id!] as BaseLayer;
                    if (instance && (hide || !layer.hide))
                        instance.changeHide(hide);
                })
            }
        }
    }
}
