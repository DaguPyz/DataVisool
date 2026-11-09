/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ComponentType, CSSProperties, ForwardedRef, forwardRef, useEffect, useImperativeHandle, useState} from "react";
import './BPNode.less';
import {ConnectionPoint} from "@icon-park/react";
import {AnchorPointType, IPoint, NodeInfoType} from "@datavisool/sdk/types";
import {getBlueprintNodeTitleBgColor} from "@/designer/blueprint/util/BPNodeEnableUtil.ts";

export interface NodeProps extends NodeInfoType {
    position?: IPoint;
    icon?: ComponentType;
    titleBgColor?: string;
    titleChanger?: (v: string) => void;
}

export interface BPNodeRef {
    setEnabled: (enabled: boolean) => void;
}

const BPNode = forwardRef((props: NodeProps, ref: ForwardedRef<BPNodeRef>) => {
    const {icon: Icon = ConnectionPoint, titleChanger, input = [], output = [], titleBgColor = '#247057'} = props;
    const cpList = [...output, ...input];
    const [editable, setEditable] = useState(false);
    const [name, setName] = useState(props.name);
    const [enabled, setEnabled] = useState(props.enabled !== false);

    useImperativeHandle(ref, () => ({
        setEnabled,
    }));

    useEffect(() => {
        setEnabled(props.enabled !== false);
    }, [props.enabled]);

    const headerBgColor = getBlueprintNodeTitleBgColor(titleBgColor, enabled);

    const activeEditable = () => {
        if (titleChanger)
            setEditable(true);
    }

    return (
        <div className={`bp-node ${enabled ? '' : 'bp-node-disabled'}`}
             style={{'--bp-node-accent': headerBgColor} as CSSProperties}>
            <div className={'bp-node-header'}>
                <div className={'bp-node-icon'}><Icon size={16}/></div>
                <div className={'bp-node-title'} onDoubleClick={() => activeEditable()} title={name}>
                    {
                        editable ? <input defaultValue={name}
                                          readOnly={!editable}
                                          onBlur={(e) => {
                                              const v = e.target.value;
                                              setName(v);
                                              titleChanger && titleChanger(v);
                                              setEditable(false);
                                          }}
                                          autoFocus={true}
                                          ref={ref => ref?.select()}/> : name
                    }
                </div>
            </div>
            <div className={'bp-node-body'}>
                {
                    cpList.map((cp, index) => {
                        const {id, name, type, used} = cp;
                        return (
                            <div key={index}
                                 className={`bp-node-ap ${type === AnchorPointType.INPUT ? 'node-ap-input' : 'node-ap-output'}`}>
                                <div className={'bp-node-ap-circle'}>
                                    <span id={id} style={{background: used ? '#4ba6ff' : '#333333'}} className={`ap-circle ${used ? 'ap-circle-used' : ''} ${type === AnchorPointType.INPUT ?
                                        'ap-circle-input' : 'ap-circle-output'}`}/>
                                </div>
                                <div className={'bg-node-ap-label'}>{name}</div>
                            </div>
                        )
                    })
                }
            </div>
        </div>
    )
})

export default BPNode;
