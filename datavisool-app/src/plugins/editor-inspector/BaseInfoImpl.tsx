/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component} from 'react';
import {
    AlignBottomTwo,
    AlignHorizontalCenterTwo,
    AlignLeftTwo,
    AlignRightTwo,
    AlignTopTwo,
    AlignVerticalCenterTwo
} from "@icon-park/react";
import type {AbstractDesignerController} from "@datavisool/sdk/core";
import type {ILayerItem, ILayerTransformItem} from "@datavisool/sdk/types";
import type {EditorInspectorTarget} from '@datavisool/sdk/plugin/contracts/editorInspector';
import {FieldChangeData, DatavisoolGUI, type Control} from "@datavisool/ui";
import {normalizeLayerTransform} from "@/util/LayerTransformUtil.ts";
import {InspectorDomainContext, type InspectorDomainContextValue} from './InspectorDomainContext.ts';

/**
 * lc组件基础信息
 */
class BaseInfo extends Component<{ controller: AbstractDesignerController }, ILayerItem & { version?: string }> {
    static contextType = InspectorDomainContext;
    declare context: InspectorDomainContextValue | null;

    private readonly fieldChangeTimers = new Set<ReturnType<typeof setTimeout>>();

    constructor(props: { controller: AbstractDesignerController }, context?: InspectorDomainContextValue | null) {
        super(props, context);
        this.state = BaseInfo.initialState(this.context?.target);
    }

    private static initialState(target: EditorInspectorTarget | undefined): ILayerItem & {version?: string} {
        if (!target) return {} as ILayerItem & {version?: string};
        return {
            ...target.layer,
            version: target.componentInfo.version,
            transform: normalizeLayerTransform(target.layer.transform),
        };
    }

    componentDidMount() {
        const id = this.context?.target.id;
        if (id) this.context?.store.setBaseInfoRef(id, this);
    }

    componentWillUnmount() {
        this.fieldChangeTimers.forEach(timer => clearTimeout(timer));
        this.fieldChangeTimers.clear();
        const id = this.context?.target.id;
        if (id) this.context?.store.setBaseInfoRef(id, null);
    }

    cancelPending = () => {
        this.fieldChangeTimers.forEach(timer => clearTimeout(timer));
        this.fieldChangeTimers.clear();
    }

    changeName = (value: string) => {
        const {domain, target} = this.context ?? {} as InspectorDomainContextValue;
        if (!domain || !target || !this.context?.canEdit()) return;
        if (domain.applyLayerEdit(target.id, {kind: 'rename', name: value})) this.setState({name: value});
    }

    changeTransform = (transform: Partial<ILayerTransformItem>) => {
        const context = this.context;
        if (context?.canEdit()) context.domain.applyLayerEdit(context.target.id, {kind: 'transform', transform});
    }

    resetTransform = () => {
        this.changeTransform(normalizeLayerTransform());
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    handleMap: Record<string, (value?: any) => void> = {
        "name": this.changeName,
        "width": (value: number) => this.applyLayerEdit({kind: 'resize', width: value}),
        "height": (value: number) => this.applyLayerEdit({kind: 'resize', height: value}),
        "posX": (value: number) => this.applyLayerEdit({kind: 'move', x: value}),
        "posY": (value: number) => this.applyLayerEdit({kind: 'move', y: value}),
        "align": (align: string) => this.handleMap[align](),
        "left": () => this.applyLayerEdit({kind: 'align', alignment: 'left'}),
        "horizontally": () => this.applyLayerEdit({kind: 'align', alignment: 'center-x'}),
        "right": () => this.applyLayerEdit({kind: 'align', alignment: 'right'}),
        "top": () => this.applyLayerEdit({kind: 'align', alignment: 'top'}),
        "vertically": () => this.applyLayerEdit({kind: 'align', alignment: 'center-y'}),
        "bottom": () => this.applyLayerEdit({kind: 'align', alignment: 'bottom'}),
        "rotateZ": (value: number) => this.changeTransform({rotateZ: value}),
        "rotateX": (value: number) => this.changeTransform({rotateX: value}),
        "rotateY": (value: number) => this.changeTransform({rotateY: value}),
        "skewX": (value: number) => this.changeTransform({skewX: value}),
        "skewY": (value: number) => this.changeTransform({skewY: value}),
        "perspective": (value: number) => this.changeTransform({perspective: value}),
        "transformOrigin": (value: string) => this.changeTransform({transformOrigin: value}),
        "transformReset": () => this.resetTransform(),
    }

    applyLayerEdit = (edit: Parameters<InspectorDomainContextValue['domain']['applyLayerEdit']>[1]) => {
        const context = this.context;
        if (context?.canEdit()) context.domain.applyLayerEdit(context.target.id, edit);
    }

    onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id: key, data} = fieldChangeData;
        const context = this.context;
        const domain = context?.domain;
        const target = context?.target;
        if (!domain || !target || !context?.canEdit()) return;
        const layerTimer = setTimeout(() => {
            this.fieldChangeTimers.delete(layerTimer);
            const currentContext = this.context;
            if (!domain.isActive() || !currentContext?.canEdit() || currentContext.domain !== domain || currentContext.target.id !== target.id) return;
            const handler = key ? this.handleMap[key] : undefined;
            handler && handler(data);
        }, 1);
        this.fieldChangeTimers.add(layerTimer);
        if (key === 'name') this.setState({name: String(data ?? '')});
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
