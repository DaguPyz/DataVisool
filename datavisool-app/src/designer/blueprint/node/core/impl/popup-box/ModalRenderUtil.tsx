/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useMemo, useRef, useState} from "react";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import {Dialog} from "@datavisool/ui";
import {ILayerItem} from "@datavisool/sdk/types";
import {AbstractDefinition} from "@datavisool/sdk/core";
import {DesignerMode} from "@datavisool/sdk/types";
import LayerUtil from "@/designer/left/layer-list/util/LayerUtil.ts";
import {cloneDeep} from "lodash";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import "./ModalRenderUtil.less";

type ModalWrapperOptions = {
    background?: string;
    title?: string;
    titleColor?: string;
    nodeId?: string;
};

type ICoordinates = {
    x: number;
    y: number;
};

const ModalComponentContainer = (props: { layer: ILayerItem; designerManager: DesignerManager }) => {
    const {layer, designerManager} = props;
    const containerRef = useRef(null);

    useEffect(() => {
        const componentDefine: AbstractDefinition = DesignerLoader.definitionMap[layer.type ?? ''];
        if (!componentDefine)
            return;
        const Controller = componentDefine.getController();
        if (!Controller)
            return;
        const sourceController = designerManager.layerManager?.controllers[layer.id ?? ''];
        if (!sourceController)
            return;
        const config = sourceController?.config;
        const controller = new Controller()! as any;
        controller.designerManager = designerManager;
        controller.bpExecutor = designerManager.bpExecutor;
        let cancelled = false;
        let createSettled = false;
        let destroyed = false;
        let changeDataProxyRegistered = false;
        const destroyController = () => {
            if (destroyed) return;
            destroyed = true;
            try {
                controller.destroy();
            } catch (error) {
                console.error("popup component controller destroy failed", error);
            }
        };
        Promise.resolve()
            .then(() => cancelled ? undefined : controller.create(containerRef.current!, config, designerManager.bpExecutor))
            .then(() => {
                createSettled = true;
                if (cancelled) {
                    destroyController();
                    return;
                }
                controller.setVisible(!layer.hide);
                if (window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT) {
                    if (!changeDataProxyRegistered && typeof controller.changeData === "function") {
                        const changeData = controller.changeData;
                        controller.changeData = new Proxy(changeData, {
                            apply(target, thisArg, args) {
                                controller.bpExecutor?.triggerComponentEvent(
                                    layer.id ?? "",
                                    "dataChange",
                                    args[0],
                                    controller.index
                                );
                                return Reflect.apply(target, thisArg, args);
                            },
                        });
                        changeDataProxyRegistered = true;
                    }
                    controller.registerEvent();
                }
                controller.loadComponentData();
                controller.updateFilter(controller.getConfig()?.filter);
            })
            .catch((error) => {
                createSettled = true;
                if (!cancelled)
                    console.error("popup component render failed", error);
                destroyController();
            });
        return () => {
            cancelled = true;
            if (createSettled)
                destroyController();
        };
    }, [designerManager, layer])

    return (
        <div ref={containerRef} style={{
            position: 'absolute',
            width: layer.width,
            height: layer.height,
            transform: `translate(${layer.x!}px, ${layer.y!}px)`,
        }}/>
    )
}

const buildModalComponents = (nodeId: string, datumCoordinates: ICoordinates, designerManager: DesignerManager) => {
    const {layerConfigs} = designerManager.layerManager;
    const layer = layerConfigs[nodeId];
    if (!layer)
        return;
    let componentIds = [nodeId];
    if (layer.type === 'group')
        componentIds = LayerUtil.findAllChildLayer([nodeId], false, designerManager);
    componentIds = componentIds.filter(id => layerConfigs[id].type !== 'group');
    const layers = componentIds.map(id => {
        const newLayer = cloneDeep(layerConfigs[id]);
        newLayer.x = newLayer.x! - datumCoordinates.x;
        newLayer.y = newLayer.y! - datumCoordinates.y;
        return newLayer;
    }).sort((a, b) => a.order! - b.order!);

    const components = [];
    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        components.push(
            <ModalComponentContainer key={`modal_${layer.id}`} layer={layer} designerManager={designerManager}/>
        )
    }
    return components;
}

type ModalWrapperProps = {
    options: ModalWrapperOptions;
    designerManager: DesignerManager;
    size: {width: number; height: number; x: number; y: number};
    onDestroy: () => void;
};

export const ModalWrapper: React.FC<ModalWrapperProps> = ({options, designerManager, size, onDestroy}) => {
    const {title, titleColor = '#fff', background = '#1f1f1f'} = options;
    const {width, height, x, y} = size;

    const [visible, setVisible] = useState(true);
    const modalRef = useRef<HTMLDivElement | null>(null);

    const Components = useMemo(() => {
        return buildModalComponents(options.nodeId ?? '', {x, y}, designerManager) ?? null;
    }, [designerManager, options.nodeId, x, y]);

    const handleClose = () => {
        setVisible(false);
    };

    useEffect(() => {
        if (visible)
            return undefined;
        const timer = window.setTimeout(onDestroy, 220);
        return () => window.clearTimeout(timer);
    }, [onDestroy, visible]);

    return <Dialog
        open={visible}
        title={title}
        hideHeader
        showClose={false}
        centered={true}
        mask
        onClose={handleClose}
        width={'auto'}
        className="popup-box-dialog"
        bodyClassName="popup-box-dialog-body"
    >
        <div data-datavisool-i18n-skip="true" style={{background, borderRadius: 4, overflow: "hidden"}}>
            {title ? (
                <div style={{padding: 15, color: titleColor, background}}>
                    <span data-datavisool-i18n-skip="true">{title}</span>
                </div>
            ) : null}
            <div ref={modalRef} data-datavisool-i18n-skip="true" style={{width, height, position: "relative", background}}>
                {Components}
            </div>
        </div>
    </Dialog>;
};
