/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Children} from "react";
import {BaseLayer} from "./BaseLayer";
import {Down, Edit, FolderClose, FolderOpen, Lock, PreviewClose, PreviewOpen, Right, Unlock} from "@icon-park/react";

export default class LayerGroupItem extends BaseLayer {

    render() {
        const {children} = this.props;
        const {hide, lock, showContent, selected, name, inputMode} = this.state;
        return (
            <div className={'layer-group'} data-id={this.props.compId} ref={ref => this.domRef = ref!}>
                <div data-id={this.props.compId} title={name} className={`group-header ${selected ? "layer-selected" : hide
                    ? "layer-hide" : lock ? "layer-lock" : ""}`}
                     role="button" tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.onSelected(e); } }}
                     onDoubleClick={this.openInput}
                     onClick={(e) => this.onSelected(e)}>
                    <div className={'group-left'}>
                        <div
                            className={'layer-drag-handle'}
                            title={'拖拽调整顺序'}
                            onMouseDown={(event) => this.props.onDragHandleMouseDown?.(this.props.compId!, event)}
                        >
                            ⋮⋮
                        </div>
                        <div className={'group-toggle'} onClick={() => this.setState({showContent: !showContent})}>
                            {showContent ? <Down size={15}/> : <Right size={15}/>}
                        </div>
                        <div className={'group-icon'} onClick={() => this.setState({showContent: !showContent})}>
                            {showContent ? <FolderOpen size={14}/> : <FolderClose size={14}/>}
                        </div>
                        <div className={'group-name'}>{inputMode ?
                            <input type="text" defaultValue={name} autoFocus={true} onChange={this.changeLayerName}
                                   ref={ref => ref?.select()}
                                   onKeyDown={(e) => {
                                       if (e.code === "Enter")
                                           this.closeInput();
                                   }}
                                   onBlur={this.closeInput}/> : name}
                        </div>
                    </div>
                    <div className={'group-operators'}>
                        <div className={'group-operator'} onClick={this.openInput}>
                            <Edit size={14}/>
                        </div>
                        <div className={'group-operator'} onClick={this.toggleHide}>
                            {hide ? <PreviewClose size={14}/> : <PreviewOpen size={14}/>}
                        </div>
                        <div className={'group-operator'} onClick={this.toggleLock}>
                            {lock ? <Lock size={14}/> : <Unlock size={14}/>}
                        </div>
                    </div>
                </div>
                {showContent && <div className={'group-content'}>
                    {Children.map(children, child => child && <div className={'layer-tree-branch'}>
                        {child}
                    </div>)}
                </div>}
            </div>
        );
    }
}
