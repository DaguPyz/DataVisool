/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IBPLine, IPoint} from "@datavisool/sdk/types";
import {Graphics} from "pixi.js";
import type {EditorBlueprintSession} from '@/plugins/editor-blueprint/session/EditorBlueprintSession.ts';

export interface CubicBezierCurvesCP {
    firstCP: IPoint;
    secondCP: IPoint;
}

export const bpLineConfig = {
    connectingColor: '#8c55ff',
    connectingWidth: 2,
    lineColor: '#7654ff',
    lineWidth: 1.6,
    glowWidth: 5,
    hoverColor: '#9d7dff',
    hoverWidth: 2.4,
    circleRadius: 3,
    selectedColor: '#4aa8ff',
    selectedWidth: 2.6,
}

export default class BpCanvasUtil {

    //计算三次贝塞尔曲线的2个控制点
    public static calculateControlPoint(startPos: IPoint, endPos: IPoint): CubicBezierCurvesCP {
        const direction = endPos.x < startPos.x ? 'left' : 'right';
        const boxWidth = Math.abs(endPos.x - startPos.x);
        const firstCP: IPoint = {x: 0, y: 0};
        const secondCP: IPoint = {x: 0, y: 0};
        //计算贝塞尔控制点
        if (direction === 'right') {
            firstCP.x = startPos.x + (boxWidth * 0.5);
            firstCP.y = startPos.y;
            secondCP.x = endPos.x - (boxWidth * 0.5);
            secondCP.y = endPos.y;
        } else {
            firstCP.x = startPos.x + (boxWidth * 0.8);
            firstCP.y = startPos.y;
            secondCP.x = endPos.x - (boxWidth * 0.8);
            secondCP.y = endPos.y;
        }
        return {firstCP, secondCP};
    }

    public static reRenderAllLine = (session: EditorBlueprintSession) => {
        if (!session.isActive()) return;
        const currentPageManager = session.currentPageManager;
        if (!currentPageManager) return;
        const lines = Object.values(currentPageManager.bpLines ?? {});
        const updatedLines: IBPLine[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = {...lines[i]};
            //重新设置连线的起始点和终点
            const {startAnchorId, endAnchorId} = line;
            const startDom = document.getElementById(startAnchorId!);
            const endDom = document.getElementById(endAnchorId!);
            if (!startDom || !endDom)
                continue;
            const {x: startX, y: startY, width: startW, height: startH} = startDom!.getBoundingClientRect();
            const {x: endX, y: endY, width: endW, height: endH} = endDom!.getBoundingClientRect();
            //定位到锚点中心
            line.startPoint = {
                x: startX + (startW / 2) - session.canvasOffset.x,
                y: startY + (startH / 2) - session.canvasOffset.y
            };
            line.endPoint = {
                x: endX + (endW / 2) - session.canvasOffset.x,
                y: endY + (endH / 2) - session.canvasOffset.y
            };
            //重新计算二次贝塞尔曲线的控制点
            const controlPoi = BpCanvasUtil.calculateControlPoint(line.startPoint, line.endPoint);
            line.firstCP = controlPoi.firstCP;
            line.secondCP = controlPoi.secondCP;

            updatedLines.push(line);
            const lineInstance = session.lineInstances[line.id!];
            if (!lineInstance) {
                BpCanvasUtil.createLine(session, {...line});
            } else {
                BpCanvasUtil.reDrawLine(line, lineInstance)
            }
        }
        if (updatedLines.length > 0)
            session.updateLineGeometry(updatedLines);
    }

    public static updNodeAndLinePos = (session: EditorBlueprintSession, nodeId: string, position: IPoint, options?: { applyDom?: boolean }) => {
        if (!session.isActive()) return;
        if (options?.applyDom !== false) {
            const nodeElem = document.querySelector(`.bp-node-container[data-nid="${nodeId}"]`) as HTMLElement | null;
            if (nodeElem)
                nodeElem.style.transform = `translate(${position.x}px, ${position.y}px)`;
        }
        session.updBpNodeLayout({id: nodeId, position}, false);
        const currentPageManager = session.currentPageManager;
        const bpAPLineMap = currentPageManager?.bpAPLineMap ?? {};
        const bpLines = currentPageManager?.bpLines ?? {};
        //更新线段位置
        const bpNodeCtrlIns = session.currPageNodeControllers[nodeId];
        const nodeConfig = bpNodeCtrlIns?.getConfig();
        if (!nodeConfig)
            return;
        const {input = [], output = []} = nodeConfig;
        const aps = [...input!, ...output!];

        aps && aps.forEach(ap => {
            const lineIds = bpAPLineMap[ap.id!];
            if (!lineIds)
                return;
            for (let i = 0; i < lineIds.length; i++) {
                const lineId = bpAPLineMap[ap.id!][i];
                const lineInfo = bpLines[lineId];
                if (lineInfo) {
                    const {startAnchorId, endAnchorId} = lineInfo;
                    const startDom = document.getElementById(startAnchorId!);
                    const endDom = document.getElementById(endAnchorId!);
                    if (!startDom || !endDom)
                        continue;
                    const {x: startX, y: startY, width: startW, height: startH} = startDom!.getBoundingClientRect();
                    const {x: endX, y: endY, width: endW, height: endH} = endDom!.getBoundingClientRect();
                    session.updateLineGeometry([{
                        id: lineId,
                        //定位到锚点中心
                        startPoint: {
                            x: startX + (startW / 2) - session.canvasOffset.x,
                            y: startY + (startH / 2) - session.canvasOffset.y
                        },
                        endPoint: {
                            x: endX + (endW / 2) - session.canvasOffset.x,
                            y: endY + (endH / 2) - session.canvasOffset.y
                        }
                    }])
                }
            }
        });
    }

    private static cubicBezierPoint(s: IPoint, p1: IPoint, p2: IPoint, e: IPoint, t: number): IPoint {
        const x = Math.pow(1 - t, 3) * s.x +
            3 * Math.pow(1 - t, 2) * t * p1.x +
            3 * (1 - t) * Math.pow(t, 2) * p2.x +
            Math.pow(t, 3) * e.x;

        const y = Math.pow(1 - t, 3) * s.y +
            3 * Math.pow(1 - t, 2) * t * p1.y +
            3 * (1 - t) * Math.pow(t, 2) * p2.y +
            Math.pow(t, 3) * e.y;

        return {x, y};
    }

    public static createLine = (session: EditorBlueprintSession, line: IBPLine) => {
        if (!session.isActive()) return;
        const bezier = new Graphics();
        session.lineInstances[line.id!] = bezier;
        session.pixiApp?.stage.addChild(bezier);
        bezier.interactive = true;

        const {lineWidth, color} = line;

        BpCanvasUtil.drawBlueprintLine(bezier, line, lineWidth, color);

        bezier.on('pointerdown', (event) => {
            const shouldDelete = event.ctrlKey || event.metaKey;
            if (event.nativeEvent instanceof Event) {
                event.nativeEvent.stopPropagation();
                if (shouldDelete)
                    event.nativeEvent.preventDefault();
            }
            if (shouldDelete)
                session.delLine([line.id!]);
        });

        bezier.on('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                session.delLine([line.id!]);
            } else {
                session.setSelectedLines([line.id!])
                const {startPoint, firstCP, secondCP, endPoint} = session.currentPageManager!.bpLines![line.id!]!
                bezier.clear();
                BpCanvasUtil.drawBlueprintLine(bezier, {
                    ...line,
                    startPoint,
                    firstCP,
                    secondCP,
                    endPoint
                }, bpLineConfig.selectedWidth, bpLineConfig.selectedColor);
            }
        })

        bezier.on('mouseover', () => {
            session.pixiApp && (session.pixiApp.canvas.style.cursor = 'pointer')
            if (session.selectedLines.some(lineId => lineId === line.id))
                return;
            const {startPoint, firstCP, secondCP, endPoint} = session.currentPageManager!.bpLines![line.id!]!
            bezier.clear();
            BpCanvasUtil.drawBlueprintLine(bezier, {
                ...line,
                startPoint,
                firstCP,
                secondCP,
                endPoint
            }, bpLineConfig.hoverWidth, bpLineConfig.hoverColor);
        })
        bezier.on('mouseout', () => {
            session.pixiApp && (session.pixiApp.canvas.style.cursor = 'default')
            if (session.selectedLines.some(lineId => lineId === line.id))
                return;
            const {startPoint, firstCP, secondCP, endPoint} = session.currentPageManager!.bpLines![line.id!]!
            bezier.clear();
            BpCanvasUtil.drawBlueprintLine(bezier, {
                ...line,
                startPoint,
                firstCP,
                secondCP,
                endPoint
            }, bpLineConfig.lineWidth, bpLineConfig.lineColor);
        })
    }

    public static reDrawLine = (line: IBPLine, bezier: Graphics) => {
        const {startPoint, endPoint, firstCP, secondCP, lineWidth, color} = line;
        bezier?.clear();
        BpCanvasUtil.drawBlueprintLine(bezier, {
            ...line,
            startPoint,
            endPoint,
            firstCP,
            secondCP
        }, lineWidth, color);
    }

    private static drawBlueprintLine = (bezier: Graphics, line: IBPLine, width = bpLineConfig.lineWidth, color = bpLineConfig.lineColor) => {
        const {startPoint, endPoint, firstCP, secondCP} = line;
        bezier.moveTo(startPoint?.x ?? 0, startPoint?.y ?? 0);
        bezier.bezierCurveTo(firstCP?.x ?? 0, firstCP?.y ?? 0, secondCP?.x ?? 0, secondCP?.y ?? 0, endPoint?.x ?? 0, endPoint?.y ?? 0);
        bezier.stroke({width: bpLineConfig.glowWidth, color, alpha: 0.05});
        bezier.moveTo(startPoint?.x ?? 0, startPoint?.y ?? 0);
        bezier.bezierCurveTo(firstCP?.x ?? 0, firstCP?.y ?? 0, secondCP?.x ?? 0, secondCP?.y ?? 0, endPoint?.x ?? 0, endPoint?.y ?? 0);
        bezier.stroke({width, color, alpha: 0.95});

        const middlePoint = BpCanvasUtil.cubicBezierPoint(startPoint!, firstCP!, secondCP!, endPoint!, 0.5);
        bezier.circle(middlePoint.x, middlePoint.y, bpLineConfig.circleRadius + 2);
        bezier.fill({color, alpha: 0.08});
        bezier.circle(middlePoint.x, middlePoint.y, bpLineConfig.circleRadius);
        bezier.fill(color);
    }

    /**
     * 更新已使用的锚点颜色
     * @param fromId 起始锚点id
     * @param toId 结束锚点id
     * @param color 颜色
     */
    public static updateAnchorsColor = (fromId: string, toId: string, color: string) => {
        if (fromId && toId) {
            const formEle = document.getElementById(fromId);
            const toEle = document.getElementById(toId);
            formEle && formEle.style.setProperty('background-color', color, 'important');
            toEle && toEle.style.setProperty('background-color', color, 'important');
        }
    }
}

export const syncBpAnchorColorsFromLines = (lines: IBPLine[]) => {
    const anchors = document.getElementsByClassName('ap-circle');
    Array.from(anchors).forEach(anchor => (anchor as HTMLElement).style.setProperty('background-color', '#333333', 'important'));
    lines.forEach(line => {
        if (line.startAnchorId && line.endAnchorId)
            BpCanvasUtil.updateAnchorsColor(line.startAnchorId, line.endAnchorId, '#4ba6ff');
    });
};
