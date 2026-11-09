/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component} from 'react';
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import baseInfoStore from "./BaseInfoStore";
import rightStore from "@/designer/right/RightStore";
import layerListStore from "@/designer/left/layer-list/LayerListStore";
import LayerUtil from "@/designer/left/layer-list/util/LayerUtil";
import {
    AlignBottomTwo,
    AlignHorizontalCenterTwo,
    AlignLeftTwo,
    AlignRightTwo,
    AlignTopTwo,
    AlignVerticalCenterTwo
} from "@icon-park/react";
import {AbstractDesignerController} from "@datavisool/sdk/core";
import {ILayerItem, ILayerTransformItem} from "@datavisool/sdk/types";
import {FieldChangeData, DatavisoolGUI, type Control} from "@datavisool/ui";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import {convergenceToInterval} from "@/util/BoundsValidatorUtil.ts";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import {normalizeLayerTransform} from "@/util/LayerTransformUtil.ts";

/**
 * lc组件基础信息
 */
class BaseInfo extends Component<{ controller: AbstractDesignerController }, ILayerItem & { version?: string }> {

    constructor(props: { controller: AbstractDesignerController }) {
        super(props);
        this.init();
    }

    init = () => {
        const {activeElem} = rightStore;
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager;
        const layer: ILayerItem = layerConfigs[activeElem.id!];
        if (!layer) return;
        if (layer.type === 'group') {
            //分组图层
            const childLayerIds = LayerUtil.findAllChildLayer([layer.id!]).filter((id: string) => layerConfigs[id].type !== 'group');
            const rect = this.calculateGroupRect(childLayerIds);
            this.state = {...layer, ...rect};
        } else {
            //普通组件
            const baseInfo = DesignerLoader.definitionMap[layer.type!]?.getBaseInfo();
            this.state = {...layer, version: baseInfo?.version, transform: normalizeLayerTransform(layer.transform)};
        }
    }

    calculateGroupRect = (childLayerIds: string[]) => {
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager;
        let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
        childLayerIds.forEach((layerId: string) => {
            const {x = 0, y = 0, width = 0, height = 0} = layerConfigs[layerId];
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
        });
        return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
    }

    componentDidMount() {
        const {setBaseConfigRef} = baseInfoStore;
        setBaseConfigRef && setBaseConfigRef(this);
    }

    componentWillUnmount() {
        const {setBaseConfigRef} = baseInfoStore;
        setBaseConfigRef && setBaseConfigRef(null);
    }

    changeName = (value: string) => {
        const {controller} = this.props;
        controller.update({base: {name: value}}, {reRender: false});
        const {updateLayer} = window.DATAVISOOL_ENV.currentManager.layerManager;
        updateLayer && updateLayer([{id: this.state.id!, name: value as string}]);
        //如果显示图层,则更新图层名称
        const {layerInstances} = layerListStore;
        const layerInstance = layerInstances[this.state.id!];
        layerInstance && (layerInstance as Component).setState({name: value});
    }

    changeTransform = (transform: Partial<ILayerTransformItem>) => {
        if (!this.state.id)
            return;
        historyRecordOperateProxy.doTransform([
            {
                id: this.state.id,
                transform,
            }
        ]);
    }

    resetTransform = () => {
        this.changeTransform(normalizeLayerTransform());
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    handleMap: Record<string, (value?: any) => void> = {
        "name": this.changeName,
        "width": (value: number) => eventOperateStore.interactionRef?.request("resizable", {
            offsetWidth: convergenceToInterval(value as number),
            direction: [1, 1]
        }, true),
        "height": (value: number) => eventOperateStore.interactionRef?.request("resizable", {
            offsetHeight: convergenceToInterval(value as number),
            direction: [1, 1]
        }, true),
        "posX": (value: number) => eventOperateStore.interactionRef?.request("draggable", {x: convergenceToInterval(value as number)}, true),
        "posY": (value: number) => eventOperateStore.interactionRef?.request("draggable", {y: convergenceToInterval(value as number)}, true),
        "align": (align: string) => this.handleMap[align](),
        "left": () => eventOperateStore.interactionRef?.request("draggable", {x: 0}, true),
        "horizontally": () => eventOperateStore.interactionRef?.request("draggable", {x: convergenceToInterval(window.DATAVISOOL_ENV.currentManager.canvasManager!.canvasConfig.width! / 2 - this.state.width! / 2)}, true),
        "right": () => eventOperateStore.interactionRef?.request("draggable", {x: convergenceToInterval(window.DATAVISOOL_ENV.currentManager.canvasManager!.canvasConfig.width! - this.state.width!)}, true),
        "top": () => eventOperateStore.interactionRef?.request("draggable", {y: 0}, true),
        "vertically": () => eventOperateStore.interactionRef?.request("draggable", {y: convergenceToInterval(window.DATAVISOOL_ENV.currentManager.canvasManager!.canvasConfig.height! / 2 - this.state.height! / 2)}, true),
        "bottom": () => eventOperateStore.interactionRef?.request("draggable", {y: convergenceToInterval(window.DATAVISOOL_ENV.currentManager.canvasManager!.canvasConfig.height! - this.state.height!)}, true),
        "rotateZ": (value: number) => this.changeTransform({rotateZ: value}),
        "rotateX": (value: number) => this.changeTransform({rotateX: value}),
        "rotateY": (value: number) => this.changeTransform({rotateY: value}),
        "skewX": (value: number) => this.changeTransform({skewX: value}),
        "skewY": (value: number) => this.changeTransform({skewY: value}),
        "perspective": (value: number) => this.changeTransform({perspective: value}),
        "transformOrigin": (value: string) => this.changeTransform({transformOrigin: value}),
        "transformReset": () => this.resetTransform(),
    }

    onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id: key, data} = fieldChangeData;
        const {targetIds, setTargetIds} = eventOperateStore;
        if (!targetIds.includes(this.state.id as string)) {
            const {type} = this.state;
            if (type === 'group') {
                const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager;
                const childIds = LayerUtil.findAllChildLayer([this.state.id!]).filter((id: string) => layerConfigs[id].type !== 'group');
                setTargetIds(childIds!);
            } else {
                setTargetIds([this.state.id as string]);
            }
        }
        const layerTimer = setTimeout(() => {
            const handler = key ? this.handleMap[key] : undefined;
            handler && handler(data);
            clearTimeout(layerTimer);
        }, 1);
    }

    buildSchema = (): Control | Control[] => {
        const {name, width, height, x, y, transform, type} = this.state;
        const transformState = normalizeLayerTransform(transform);
        const schema: Control[] = [
            {
                type: 'grid',
                children: [
                    {
                        id: "name",
                        key: "name",
                        label: "名称",
                        type: "input",
                        value: name,

                    },
                    {
                        id: "width",
                        key: "width",
                        type: "number-input",
                        label: "宽度",
                        value: width,
                        reRender: true,
                    },
                    {
                        id: "height",
                        key: "height",
                        type: "number-input",
                        label: "高度",
                        value: height,
                        reRender: true,
                    },
                    {
                        id: "posX",
                        key: "posX",
                        type: "number-input",
                        label: "X轴",
                        reRender: true,
                        value: x,
                    },
                    {
                        id: "posY",
                        key: "posY",
                        type: "number-input",
                        label: "Y轴",
                        reRender: true,
                        value: y,
                    },
                    {
                        id: 'align',
                        label: '对齐',
                        type: 'group-button',
                        config: {
                            block: true,
                            controlStyle: {
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                width: '100%',
                                gap: 8,
                            },
                            items: [
                                {
                                    value: 'left',
                                    content: <AlignLeftTwo theme="filled"
                                                           size="14"
                                                           strokeWidth={2}
                                                           strokeLinecap="square"/>
                                },
                                {
                                    value: 'horizontally',
                                    content: <AlignHorizontalCenterTwo theme="filled"
                                                                       size="14"
                                                                       strokeWidth={2}
                                                                       strokeLinecap="square"/>
                                },
                                {
                                    value: 'right',
                                    content: <AlignRightTwo theme="filled"
                                                            size="14"
                                                            strokeWidth={2}
                                                            strokeLinecap="square"/>
                                },
                                {
                                    value: 'top',
                                    content: <AlignTopTwo theme="filled"
                                                          size="14"
                                                          strokeWidth={2}
                                                          strokeLinecap="square"/>
                                },
                                {
                                    value: 'vertically',
                                    content: <AlignVerticalCenterTwo theme="filled"
                                                                     size="14"
                                                                     strokeWidth={2}
                                                                     strokeLinecap="square"/>
                                },
                                {
                                    value: 'bottom',
                                    content: <AlignBottomTwo theme="filled"
                                                             size="14"
                                                             strokeWidth={2}
                                                             strokeLinecap="square"/>
                                }
                            ]
                        }
                    }
                ]
            }
        ];

        if (type !== 'group') {
            schema[0].children?.push({
                key: 'transform',
                children: [
                    {
                        type: 'grid',
                        config: {
                            columns: 1,
                            gridGap: '10px',
                        },
                        children: [
                            {
                                id: 'rotateZ',
                                key: 'rotateZ',
                                label: 'Z旋转',
                                type: 'number-input',
                                value: transformState.rotateZ,
                                reRender: true,
                            },
                            {
                                id: 'rotateX',
                                key: 'rotateX',
                                label: 'X旋转',
                                type: 'number-input',
                                value: transformState.rotateX,
                                reRender: true,
                            },
                            {
                                id: 'rotateY',
                                key: 'rotateY',
                                label: 'Y旋转',
                                type: 'number-input',
                                value: transformState.rotateY,
                                reRender: true,
                            },
                            {
                                id: 'perspective',
                                key: 'perspective',
                                label: '透视',
                                type: 'number-input',
                                value: transformState.perspective,
                                reRender: true,
                            },
                            {
                                id: 'skewX',
                                key: 'skewX',
                                label: 'X倾斜',
                                type: 'number-input',
                                value: transformState.skewX,
                                reRender: true,
                            },
                            {
                                id: 'skewY',
                                key: 'skewY',
                                label: 'Y倾斜',
                                type: 'number-input',
                                value: transformState.skewY,
                                reRender: true,
                            },
                            {
                                id: 'transformOrigin',
                                key: 'transformOrigin',
                                label: '原点',
                                type: 'input',
                                value: transformState.transformOrigin,
                                reRender: true,
                                config: {
                                    placeholder: '50% 50%',
                                },
                            },
                        ]
                    },
                    {
                        id: 'transformReset',
                        type: 'button',
                        config: {
                            children: '重置变形',
                            type: 'default',
                            width: '100%',
                        }
                    }
                ]
            });
        }

        return schema;
    }

    render() {
        const schema = this.buildSchema();
        return (
            <div className={'base-info-config'} style={{padding: 10}}>
                <DatavisoolGUI schema={schema} onFieldChange={this.onFieldChange}/>
            </div>
        )
    }
}

export default BaseInfo;
