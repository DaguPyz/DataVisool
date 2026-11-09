/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseLayer} from "./BaseLayer";
import {Edit, Lock, PreviewClose, PreviewOpen, Unlock} from "@icon-park/react";

class LayerItem extends BaseLayer {

    render() {
        const {name = '', inputMode, lock = false, hide = false, selected = false} = this.state || {};
        return (
            <div data-id={this.props.compId} title={name} className={`layer-item ${selected ? "layer-selected" :
                hide ? "layer-hide" : lock ? "layer-lock" : ""}`} onClick={this.onSelected}
                 role="button" tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.onSelected(e); } }}
                 onDoubleClick={this.openInput} ref={ref => this.domRef = ref}>
                <div className={'layer-main'}>
                    <div
                        className={'layer-drag-handle'}
                        title={'拖拽调整顺序'}
                        onMouseDown={(event) => this.props.onDragHandleMouseDown?.(this.props.compId!, event)}
                    >
                        ⋮⋮
                    </div>
                    <div className={'layer-name'}>
                        {inputMode ? <input type="text" defaultValue={name} autoFocus={true} onChange={this.changeLayerName}
                                            ref={ref => ref?.select()}
                                            onKeyDown={(e) => {
                                                if (e.code === "Enter")
                                                    this.closeInput();
                                            }}
                                            onBlur={this.closeInput}/> : name}
                    </div>
                </div>
                <div className={'layer-operators'}>
                    <div className={'layer-operator'} onClick={this.openInput}>
                        <Edit size={14}/>
                    </div>
                    <div className={'layer-operator'} onClick={this.toggleHide}>
                        {hide ? <PreviewClose size={14}/> : <PreviewOpen size={14}/>}
                    </div>
                    <div className={'layer-operator'} onClick={this.toggleLock}>
                        {lock ? <Lock size={14}/> : <Unlock size={14}/>}
                    </div>
                </div>
            </div>
        );
    }
}

export default LayerItem;
