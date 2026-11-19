/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useEffect, useReducer, useState, type ComponentType, type CSSProperties} from 'react';
import './BPNode.less';
import {ConnectionPoint} from '@icon-park/react';
import {AnchorPointType} from '@datavisool/sdk/types';
import type {EditorBlueprintNodeController} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {getBlueprintNodeTitleBgColor} from '@/plugins/editor-blueprint/util/BlueprintNodeUIUtil.ts';

export interface BPNodeProps {
    controller: EditorBlueprintNodeController;
    icon?: ComponentType<{size?: number}>;
    titleBgColor?: string;
    editableTitle?: boolean;
}

const BPNode = ({controller, icon: Icon = ConnectionPoint, titleBgColor = '#247057', editableTitle = false}: BPNodeProps) => {
    const [, refresh] = useReducer((value: number) => value + 1, 0);
    const [editable, setEditable] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    useEffect(() => {
        const unsubscribe = controller.subscribe(refresh);
        refresh();
        return unsubscribe;
    }, [controller]);

    const config = controller.getConfig();
    const name = config?.name ?? '';
    useEffect(() => setNameDraft(name), [controller, config?.id, name]);
    const enabled = config?.enabled !== false;
    const cpList = [...(config?.output ?? []), ...(config?.input ?? [])];
    const headerBgColor = getBlueprintNodeTitleBgColor(titleBgColor, enabled);

    return (
        <div className={`bp-node ${enabled ? '' : 'bp-node-disabled'}`}
             style={{'--bp-node-accent': headerBgColor} as CSSProperties}>
            <div className="bp-node-header">
                <div className="bp-node-icon"><Icon size={16}/></div>
                <div className="bp-node-title" onDoubleClick={() => editableTitle && setEditable(true)} title={name}>
                    {editable ? <input value={nameDraft} onChange={event => setNameDraft(event.target.value)}
                                       onBlur={() => {
                                           controller.update({name: nameDraft});
                                           setEditable(false);
                                       }} autoFocus
                                       ref={input => input?.select()}/> : name}
                </div>
            </div>
            <div className="bp-node-body">
                {cpList.map((cp, index) => {
                    const {id, name: anchorName, type, used} = cp;
                    return (
                        <div key={index}
                             className={`bp-node-ap ${type === AnchorPointType.INPUT ? 'node-ap-input' : 'node-ap-output'}`}>
                            <div className="bp-node-ap-circle">
                                <span id={id} style={{background: used ? '#4ba6ff' : '#333333'}}
                                      className={`ap-circle ${used ? 'ap-circle-used' : ''} ${type === AnchorPointType.INPUT ? 'ap-circle-input' : 'ap-circle-output'}`}/>
                            </div>
                            <div className="bg-node-ap-label">{anchorName}</div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

export default BPNode;
