/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ScaleCore} from "@/designer/operate-provider/scale/ScaleCore";
import {IPoint} from "@datavisool/sdk/types";

export interface DragScaleData {
    scale: number;
    ratio: number;
    position: IPoint;
    dragging: boolean;
}

export interface DragScaleProviderConfig {
    eventContainer: HTMLDivElement;
    dsTarget: HTMLDivElement;
    content?: HTMLDivElement | null;
    position?: IPoint;
    scale?: number;
    dragCallback?: (dsData: DragScaleData, e: PointerEvent) => void;
    dragStartCallback?: (dsData: DragScaleData, e: PointerEvent) => void;
    dragMoveStartCallback?: (dsData: DragScaleData, e: PointerEvent) => void;
    dragEndCallback?: (dsData: DragScaleData, e: PointerEvent) => void;
    scaleCallback?: (dsData: DragScaleData, e: WheelEvent | null) => void;
}

/**
 * 拖拽缩放容器，独立提供拖拽与缩放功能。
 * 1.拖拽画布统一操作方式为长按鼠标右键
 * 2.缩放画布统一操作方式alt+鼠标滚轮
 * 上述两种操作的相关事件均在此组件内部完成（除缩放逻辑外，缩放逻辑调用外部方法获取scale比例）
 *
 * 主编辑器、蓝图编辑器均使用该类提供拖拽缩放功能
 */
export default class DragScaleProvider {
    private readonly config: DragScaleProviderConfig;
    public scaleCore: ScaleCore = new ScaleCore();
    private _pendingDrag = false;
    private _pendingScale = false;
    private dragFrame: number | null = null;
    private scaleFrame: number | null = null;
    private destroyed = false;
    private readonly dragThreshold = 4;
    private rightDragSession: {
        pointerId: number;
        startClientX: number;
        startClientY: number;
        lastClientX: number;
        lastClientY: number;
        originX: number;
        originY: number;
        dragging: boolean;
    } | null = null;

    constructor(config: DragScaleProviderConfig) {
        this.config = config;
        if (!this.config.position)
            this.config.position = {x: 0, y: 0};
        if (Number.isFinite(config.scale) && config.scale! > 0)
            this.scaleCore.scale = Math.min(this.scaleCore.max, Math.max(this.scaleCore.min, config.scale!));
        //注册拖拽
        this.registerDrag();
        //注册缩放
        this.registerScale();
    }

    /************************事件、变量销毁************************/
    public destroy() {
        this.destroyed = true;
        this.cancelFrames();
        const container = this.config.eventContainer;
        if (container) {
            container?.removeEventListener('pointerdown', this.pointerDown);
            container?.removeEventListener('pointerup', this.pointerUp);
            container?.removeEventListener('wheel', this.doWheel);
            container?.removeEventListener('contextmenu', this.contextMenu);
            container.removeEventListener('pointermove', this.onDragMove);
            container.removeEventListener('pointercancel', this.pointerCancel);
            container.removeEventListener('lostpointercapture', this.pointerCancel);
            const pointerId = this.rightDragSession?.pointerId;
            this.rightDragSession = null;
            if (pointerId !== undefined && container.hasPointerCapture?.(pointerId))
                container.releasePointerCapture(pointerId);
        }
    }

    private cancelFrames() {
        if (this.dragFrame !== null) cancelAnimationFrame(this.dragFrame);
        if (this.scaleFrame !== null) cancelAnimationFrame(this.scaleFrame);
        this.dragFrame = this.scaleFrame = null;
        this._pendingDrag = this._pendingScale = false;
    }

    /** Keep programmatic controls and subsequent mouse gestures on the same camera. */
    public setViewport = (scale: number, position: IPoint, event: WheelEvent | null = null) => {
        if (this.destroyed || !Number.isFinite(scale) || scale <= 0 ||
            !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
        this.cancelFrames();
        const nextScale = Math.min(this.scaleCore.max, Math.max(this.scaleCore.min, scale));
        this.scaleCore.ratio = nextScale / this.scaleCore.scale;
        this.scaleCore.scale = nextScale;
        this.config.position = {...position};
        if (this.rightDragSession) {
            const session = this.rightDragSession;
            session.originX = position.x;
            session.originY = position.y;
            session.startClientX = session.lastClientX;
            session.startClientY = session.lastClientY;
        }
        this.config.dsTarget.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) scale(${nextScale})`;
        this.config.scaleCallback?.({scale: nextScale, ratio: this.scaleCore.ratio,
            position: this.config.position, dragging: false}, event);
    };

    public zoomTo = (scale: number, anchor?: IPoint, event: WheelEvent | null = null) => {
        if (this.destroyed || !Number.isFinite(scale) || scale <= 0) return;
        const rect = this.config.eventContainer.getBoundingClientRect();
        const point = anchor ?? {x: rect.width / 2, y: rect.height / 2};
        const nextScale = Math.min(this.scaleCore.max, Math.max(this.scaleCore.min, scale));
        const ratio = nextScale / this.scaleCore.scale;
        const position = this.config.position!;
        // The existing target uses the default center transform origin; blueprint targets are 0×0.
        this.setViewport(nextScale, {
            x: position.x - (ratio - 1) * (point.x - position.x - this.config.dsTarget.offsetWidth / 2),
            y: position.y - (ratio - 1) * (point.y - position.y - this.config.dsTarget.offsetHeight / 2),
        }, event);
    };

    /************************注册拖拽事件************************/
    private registerDrag() {
        const {eventContainer, dsTarget, position = {x: 0, y: 0}} = this.config;
        //初始化被拖拽对象位置
        dsTarget.style.transform = 'translate3d(' + position.x + 'px, ' + position.y + 'px, 0) scale(' + this.scaleCore.scale + ')';
        //阻止系统右键菜单显示
        eventContainer.addEventListener("contextmenu", this.contextMenu)
        //监听拖拽开始
        this.onDragStart();
        //监听拖拽结束
        this.onDragEnd();
    }

    private contextMenu = (e: MouseEvent): void => e.preventDefault();

    private onDragStart = (): void => this.config.eventContainer.addEventListener('pointerdown', this.pointerDown);

    private onDragMove = (e: PointerEvent): void => {
        if (e.buttons === 2 && this.rightDragSession) {
            e.preventDefault();
            const session = this.rightDragSession;
            session.lastClientX = e.clientX;
            session.lastClientY = e.clientY;
            const deltaX = session.lastClientX - session.startClientX;
            const deltaY = session.lastClientY - session.startClientY;
            const moved = (deltaX * deltaX + deltaY * deltaY) >= (this.dragThreshold * this.dragThreshold);
            if (!moved) {
                return;
            }
            if (!session.dragging) {
                session.dragging = true;
                const position = {
                    x: session.originX + deltaX,
                    y: session.originY + deltaY,
                };
                this.config.dragMoveStartCallback?.({
                    scale: this.scaleCore.scale,
                    ratio: this.scaleCore.ratio,
                    position,
                    dragging: true,
                }, e);
            }
            if (!this._pendingDrag) {
                this._pendingDrag = true;
                const currentSession = session;
                this.dragFrame = requestAnimationFrame(() => {
                    this.dragFrame = null;
                    this._pendingDrag = false;
                    if (this.destroyed) {
                        return;
                    }
                    const position = {
                        x: currentSession.originX + (currentSession.lastClientX - currentSession.startClientX),
                        y: currentSession.originY + (currentSession.lastClientY - currentSession.startClientY),
                    };
                    this.config.position!.x = position.x;
                    this.config.position!.y = position.y;

                    this.config.dsTarget.style.transform = `translate3d(${this.config.position!.x}px, ${this.config.position!.y}px, 0) scale(${this.scaleCore.scale})`;

                    this.config.dragCallback?.({
                        scale: this.scaleCore.scale,
                        ratio: this.scaleCore.ratio,
                        position: this.config.position ?? {x: 0, y: 0},
                        dragging: currentSession.dragging,
                    }, e);
                });
            }
        }
    };

    private onDragEnd = (): void => {
        this.config.eventContainer.addEventListener('pointerup', this.pointerUp);
        this.config.eventContainer.addEventListener('pointercancel', this.pointerCancel);
        this.config.eventContainer.addEventListener('lostpointercapture', this.pointerCancel);
    };

    private pointerCancel = (event: PointerEvent) => {
        const session = this.rightDragSession;
        if (!session || session.pointerId !== event.pointerId) return;
        this.cancelFrames();
        this.rightDragSession = null;
        this.config.eventContainer.removeEventListener('pointermove', this.onDragMove);
        this.config.dragEndCallback?.({scale: this.scaleCore.scale, ratio: this.scaleCore.ratio,
            position: this.config.position!, dragging: session.dragging}, event);
    };

    private pointerDown = (e: PointerEvent): void => {
        if (e.button === 2) {
            e.preventDefault();
            document.getSelection()?.removeAllRanges();
            this.rightDragSession = {
                pointerId: e.pointerId,
                startClientX: e.clientX,
                startClientY: e.clientY,
                lastClientX: e.clientX,
                lastClientY: e.clientY,
                originX: this.config.position?.x ?? 0,
                originY: this.config.position?.y ?? 0,
                dragging: false,
            };
            //设置鼠标捕获，当鼠标移出视口外时，仍然能够监听到鼠标移动事件
            this.config.eventContainer.setPointerCapture(e.pointerId);
            //监听拖拽移动
            this.config.eventContainer.addEventListener('pointermove', this.onDragMove);
            this.config.dragStartCallback?.({
                scale: this.scaleCore.scale,
                ratio: this.scaleCore.ratio,
                position: this.config.position ?? {x: 0, y: 0},
                dragging: false,
            }, e);
        }
    }

    private pointerUp = (e: PointerEvent): void => {
        if (e.button === 2) {
            const session = this.rightDragSession;
            this.rightDragSession = null;
            if (this.config.eventContainer.hasPointerCapture?.(e.pointerId))
                this.config.eventContainer.releasePointerCapture(e.pointerId);
            //取消拖拽移动监听
            this.config.eventContainer.removeEventListener('pointermove', this.onDragMove);
            this.config.dragEndCallback?.({
                scale: this.scaleCore.scale,
                ratio: this.scaleCore.ratio,
                position: session ? {
                    x: session.originX + (session.lastClientX - session.startClientX),
                    y: session.originY + (session.lastClientY - session.startClientY),
                } : (this.config.position ?? {x: 0, y: 0}),
                dragging: session?.dragging ?? false,
            }, e);
        }
    }


    /************************注册缩放事件************************/
    private registerScale = (): void => this.config.eventContainer.addEventListener('wheel', this.doWheel);

    private doWheel = (e: WheelEvent): void => {
        if (e.altKey && e.buttons !== 2) {
            if (!this._pendingScale) {
                this._pendingScale = true;
                this.scaleFrame = requestAnimationFrame(() => {
                    this.scaleFrame = null;
                    this._pendingScale = false;
                    if (this.destroyed) return;
                    const {x: offSetX, y: offSetY} = this.config.eventContainer.getBoundingClientRect();
                    this.zoomTo(this.scaleCore.scale * (e.deltaY > 0 ? 1 / 1.2 : 1.2),
                        {x: e.clientX - offSetX, y: e.clientY - offSetY}, e);
                });
            }
        }
    };

    public reset = () => {
        const container = this.config.eventContainer;
        const target = this.config.dsTarget;
        if (this.destroyed || !container || !target)
            return;

        const scale = 1;

        // 获取容器和目标的大小
        const containerRect = container.getBoundingClientRect();

        // 获取目标自身宽高（不经过 transform 的原始尺寸）
        const targetWidth = target.offsetWidth;
        const targetHeight = target.offsetHeight;

        // 计算将 target 移动到 container 中心的位置
        const x = (containerRect.width - targetWidth * scale) / 2;
        const y = (containerRect.height - targetHeight * scale) / 2;

        // 更新位置
        this.setViewport(scale, {x, y});
        if (this.config.dragCallback) {
            const {ratio} = this.scaleCore;
            this.config.dragCallback({scale, ratio, position: this.config.position!, dragging: false}, null as any);
        }

    }

}
