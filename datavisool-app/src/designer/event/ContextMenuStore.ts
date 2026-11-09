/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";

type ContextMenuKind = "canvas" | "bp";

interface PendingContextMenu {
    kind: ContextMenuKind;
    position: [number, number];
}

export interface CanvasMenuCandidate {
    id: string;
    name: string;
    type: string;
    locked: boolean;
}

type CanvasMenuPrepare = (position: [number, number]) => CanvasMenuCandidate[];

/**
 * 右键操作菜单的状态管理类。
 */
export class ContextMenuStore {
    constructor() {
        makeObservable(this, {
            canvasMenuVisible: observable,
            position: observable,
            bpMenuVisible: observable,
            canvasMenuCandidates: observable,
            rightPointerDown: observable,
            setPosition: action,
            updateCanvasMenuVisible: action,
            updateBpMenuVisible: action,
            hideMenus: action,
            beginRightDrag: action,
            startRightDrag: action,
            endRightDrag: action,
            requestCanvasMenu: action,
            requestBpMenu: action,
            setCanvasMenuPrepare: action,
            clearPendingMenu: action,
            consumeSuppressedContextMenu: action,
            reset: action,
        })
    }

    /**
     * 右键菜单显示状态
     */
    canvasMenuVisible = false;

    bpMenuVisible = false;

    canvasMenuCandidates: CanvasMenuCandidate[] = [];

    private canvasMenuPrepare: CanvasMenuPrepare | null = null;

    /**
     * 当前右键是否仍处于按下状态。
     * 用于区分“右键菜单”与“右键拖拽”。
     */
    rightPointerDown = false;

    /**
     * 当前是否处于右键拖拽画布中。
     * 一旦进入拖拽态，右键菜单必须被抑制。
     */
    rightDragActive = false;

    /**
     * 是否需要抑制下一次右键菜单。
     * 用于处理“右键拖拽结束后，浏览器随后触发的 contextmenu”。
     */
    suppressNextContextMenu = false;

    /**
     * 鼠标当前指向的目标dom元素
     * 用于记录鼠标右键点击时的目标元素，用于快捷键操作时的目标元素的范围筛选
     */
    pointerTarget: EventTarget | null = null;

    /**
     * 右键系统菜单时候鼠标指针位置
     */
    position: [number, number] = [0, 0];

    /**
     * 右键菜单候选。
     * 当右键还按着时，只记录菜单请求，等右键抬起且没有拖拽时再真正展示。
     */
    pendingMenu: PendingContextMenu | null = null;

    updateCanvasMenuVisible = (visible: boolean) => this.canvasMenuVisible = visible;

    updateBpMenuVisible = (visible: boolean) => this.bpMenuVisible = visible;

    hideMenus = () => {
        this.canvasMenuVisible = false;
        this.bpMenuVisible = false;
    }

    setPosition = (position: [number, number]) => this.position = position;

    setPointerTarget = (target: EventTarget) => this.pointerTarget = target;

    beginRightDrag = () => {
        this.rightPointerDown = true;
        this.rightDragActive = false;
        this.suppressNextContextMenu = false;
        this.clearPendingMenu();
        this.hideMenus();
    }

    startRightDrag = () => {
        this.rightDragActive = true;
        this.clearPendingMenu();
        this.suppressNextContextMenu = true;
        this.hideMenus();
    }

    endRightDrag = (dragged: boolean) => {
        this.rightPointerDown = false;
        this.rightDragActive = false;
        if (!dragged) {
            this.suppressNextContextMenu = false;
            this.flushPendingMenu();
            return;
        }
        this.clearPendingMenu();
        this.hideMenus();
    }

    requestCanvasMenu = (position: [number, number]) => this.requestMenu("canvas", position);

    requestBpMenu = (position: [number, number]) => this.requestMenu("bp", position);

    setCanvasMenuPrepare = (prepare: CanvasMenuPrepare | null) => {
        this.canvasMenuPrepare = prepare;
    }

    clearPendingMenu = () => {
        this.pendingMenu = null;
    }

    private requestMenu = (kind: ContextMenuKind, position: [number, number]) => {
        if (this.rightPointerDown) {
            this.pendingMenu = {kind, position};
            this.hideMenus();
            return;
        }
        this.pendingMenu = null;
        this.position = position;
        if (kind === "canvas") {
            this.canvasMenuCandidates = this.canvasMenuPrepare?.(position) ?? [];
            this.canvasMenuVisible = true;
            this.bpMenuVisible = false;
        } else {
            this.canvasMenuCandidates = [];
            this.canvasMenuVisible = false;
            this.bpMenuVisible = true;
        }
    }

    consumeSuppressedContextMenu = () => {
        if (!this.suppressNextContextMenu) {
            return false;
        }
        this.suppressNextContextMenu = false;
        return true;
    }

    private flushPendingMenu = () => {
        if (!this.pendingMenu) {
            return;
        }
        const {kind, position} = this.pendingMenu;
        this.pendingMenu = null;
        this.position = position;
        if (kind === "canvas") {
            this.canvasMenuCandidates = this.canvasMenuPrepare?.(position) ?? [];
            this.canvasMenuVisible = true;
            this.bpMenuVisible = false;
        } else {
            this.canvasMenuCandidates = [];
            this.canvasMenuVisible = false;
            this.bpMenuVisible = true;
        }
    }

    reset = () => {
        this.hideMenus();
        this.clearPendingMenu();
        this.rightPointerDown = false;
        this.rightDragActive = false;
        this.suppressNextContextMenu = false;
        this.position = [0, 0];
        this.pointerTarget = null;
        this.canvasMenuCandidates = [];
        this.canvasMenuPrepare = null;
    }
}

const contextMenuStore = new ContextMenuStore();
export default contextMenuStore;
