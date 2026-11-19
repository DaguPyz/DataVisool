/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {ChangeEvent, MouseEvent} from "react";
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {LayerSelectionModifiers} from '../EditorLayersState.ts';

export interface LayerDragHandleProps {
    readonly canvas: Pick<EditorCanvasService, 'closeContextMenu'>;
    onDragHandleMouseDown?: (layerId: string, event: React.MouseEvent<HTMLDivElement>) => void;
}

export interface LayerProps {
    compId?: string;
    name?: string;
    lock?: boolean;
    hide?: boolean;
    effectiveLock?: boolean;
    effectiveHide?: boolean;
    selected?: boolean;
    type?: string;
    expanded?: boolean;
    children?: React.ReactNode;
    onSelect?(id: string, event: LayerSelectionModifiers): void;
    onToggleLock?(id: string, locked: boolean): void;
    onToggleHide?(id: string, hidden: boolean): void;
    onRename?(id: string, name: string): void;
    onToggleExpanded?(id: string): void;
    onRegisterRow?(id: string, element: HTMLDivElement | null): void;
}

interface BaseLayerState {inputMode: boolean; draftName: string}

export abstract class BaseLayer extends React.PureComponent<LayerProps & LayerDragHandleProps, BaseLayerState> {

    constructor(props: LayerProps & LayerDragHandleProps) {
        super(props);
        this.state = {inputMode: false, draftName: props.name || ''};
    }

    /**
     * 由于图层列表的操作事件阻止了冒泡，因此通过本方法单独判断是否需要关闭图层列表上打开的右键菜单
     */
    closeContextMenu = () => {
        this.props.canvas.closeContextMenu();
    }

    toggleLock = (event: MouseEvent) => {
        event.stopPropagation();
        const {compId, lock} = this.props;
        if (compId) this.props.onToggleLock?.(compId, !lock);
        this.closeContextMenu();
    }

    toggleHide = (event: MouseEvent) => {
        event.stopPropagation();
        const {compId, hide} = this.props;
        if (compId) this.props.onToggleHide?.(compId, !hide);
        this.closeContextMenu();
    }

    onSelected = (event: MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
        const {compId} = this.props;
        event.stopPropagation();
        if (compId) this.props.onSelect?.(compId, event);
        this.closeContextMenu();
    }

    openInput = (event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (!this.state.inputMode)
            this.setState({inputMode: true, draftName: this.props.name || ''});
        this.closeContextMenu();
    }

    closeInput = () => {
        if (!this.state.inputMode) return;
        const {compId, name} = this.props;
        const nextName = this.state.draftName.trim();
        if (compId && nextName && nextName !== (name || '')) this.props.onRename?.(compId, nextName);
        this.setState({inputMode: false});
    }

    changeLayerName = (event: ChangeEvent<HTMLInputElement>) => {
        this.setState({draftName: event.target.value});
    }
}
