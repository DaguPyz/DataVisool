/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IBPLine, IPoint} from "@datavisool/sdk/types";
import {Graphics} from "pixi.js";
import bpHistoryRecordOperateProxy from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";

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

    public static reRenderAllLine = () => {
        const {currentPageManager, canvasOffset, lineInstances} = window.DATAVISOOL_ENV.currentManager.bluePrintManager!;
        const {bpLines} = currentPageManager!;
        const lines = Object.values(bpLines);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
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
                x: startX + (startW / 2) - canvasOffset.x,
                y: startY + (startH / 2) - canvasOffset.y
            };
            line.endPoint = {
                x: endX + (endW / 2) - canvasOffset.x,
                y: endY + (endH / 2) - canvasOffset.y
            };
            //重新计算二次贝塞尔曲线的控制点
            const controlPoi = BpCanvasUtil.calculateControlPoint(line.startPoint, line.endPoint);
            line.firstCP = controlPoi.firstCP;
            line.secondCP = controlPoi.secondCP;

            const lineInstance = lineInstances[line.id!];
            if (!lineInstance) {
                BpCanvasUtil.createLine({...line});
            } else {
                BpCanvasUtil.reDrawLine(line, lineInstance)
            }
        }
    }

    public static updNodeAndLinePos = (nodeId: string, position: IPoint, options?: { applyDom?: boolean }) => {
        const {
            currPageNodeControllers, currentPageManager,
            updLinePos, updBpNodeLayout, canvasOffset
        } = window.DATAVISOOL_ENV.currentManager.bluePrintManager!;
        const {bpAPLineMap, bpLines,} = currentPageManager!;
        if (options?.applyDom !== false) {
            const nodeElem = document.querySelector(`.bp-node-container[data-nid="${nodeId}"]`) as HTMLElement | null;
            if (nodeElem)
                nodeElem.style.transform = `translate(${position.x}px, ${position.y}px)`;
        }
        //更新节点位置
        updBpNodeLayout({
            id: nodeId,
            position: {
                x: position.x,
                y: position.y
            }
        })
        //更新线段位置
        const bpNodeCtrlIns = currPageNodeControllers[nodeId];
        const {input = [], output = []} = bpNodeCtrlIns.getConfig();
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
                    updLinePos({
                        id: lineId,
                        //定位到锚点中心
                        startPoint: {
                            x: startX + (startW / 2) - canvasOffset.x,
                            y: startY + (startH / 2) - canvasOffset.y
                        },
                        endPoint: {
                            x: endX + (endW / 2) - canvasOffset.x,
                            y: endY + (endH / 2) - canvasOffset.y
                        }
                    })
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

    public static createLine = (line: IBPLine) => {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager!;
        const {currentPageManager} = bpManager;
        const bezier = new Graphics();
        bpManager.lineInstances[line.id!] = bezier;
        bpManager.pixiApp?.stage.addChild(bezier);
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
                bpHistoryRecordOperateProxy.doDelLines([line.id!]);
        });

        bezier.on('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                bpHistoryRecordOperateProxy.doDelLines([line.id!])
            } else {
                bpManager.setSelectedLines([line.id!])
                const {startPoint, firstCP, secondCP, endPoint} = currentPageManager!.bpLines[line.id!]!
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
            bpManager.pixiApp && (bpManager.pixiApp.canvas.style.cursor = 'pointer')
            if (bpManager.selectedLines.some(lineId => lineId === line.id))
                return;
            const {startPoint, firstCP, secondCP, endPoint} = currentPageManager!.bpLines[line.id!]!
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
            bpManager.pixiApp && (bpManager.pixiApp.canvas.style.cursor = 'default')
            if (bpManager.selectedLines.some(lineId => lineId === line.id))
                return;
            const {startPoint, firstCP, secondCP, endPoint} = currentPageManager!.bpLines[line.id!]!
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
