/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {useEffect, useRef} from 'react';
import BpCanvasUtil, {bpLineConfig} from "@/designer/blueprint/util/BpCanvasUtil.ts";
import {IdGenerate} from "@datavisool/sdk";
import {AnchorPointType, IBPLine} from "@datavisool/sdk/types";
import {Application, Graphics} from "pixi.js";
import {cloneDeep} from "lodash";
import bpHistoryRecordOperateProxy, {syncBpAnchorColorsFromLines} from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";
import {isBPCanvasPointAvailable} from "@/designer/blueprint/workspace/BPCanvasHitTest.ts";
import type {BPCanvasMetrics} from "@/designer/blueprint/workspace/useBPCanvasMetrics.ts";

const START_ANCHOR_HIT_THRESHOLD_X = 30;
const START_ANCHOR_HIT_THRESHOLD_Y = 24;
const END_ANCHOR_SNAP_THRESHOLD_X = 44;
const END_ANCHOR_SNAP_THRESHOLD_Y = 24;
const ANCHOR_HIT_CLASS = 'ap-circle-hit-active';
const ANCHOR_SNAP_CLASS = 'ap-circle-snap-active';

interface LineLayerProps {
    metrics: BPCanvasMetrics | null;
}

type AnchorHitArea =
    | { mode: 'radius'; radius: number }
    | { mode: 'rect'; thresholdX: number; thresholdY: number };

export default function LineLayer({metrics}: LineLayerProps) {

    const bpLineContainerRef = useRef<HTMLDivElement | null>(null);
    const metricsRef = useRef(metrics);
    metricsRef.current = metrics;
    const keyDownRef = useRef(false);
    const keyMoveRef = useRef(false);
    const dragLineRef = useRef<Graphics>();
    // 新增：吸附目标锚点引用
    const snapTargetRef = useRef<HTMLElement | null>(null);
    // 新增：吸附音效
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioUnlockedRef = useRef(false);
    // 新增：记录上一次的吸附目标，用于检测变化
    const lastSnapTargetRef = useRef<HTMLElement | null>(null);
    const startHitTargetRef = useRef<HTMLElement | null>(null);
    const startHitFrameRef = useRef<number | null>(null);
    const lastMousePointRef = useRef<{ x: number; y: number } | null>(null);

    const currentLineRef = useRef<IBPLine>({
        color: bpLineConfig.lineColor,
        lineWidth: bpLineConfig.lineWidth,
        startPoint: {x: 0, y: 0},
        endPoint: {x: 0, y: 0},
        firstCP: {x: 0, y: 0},
        secondCP: {x: 0, y: 0},
    });

    const getAudioContext = () => {
        if (!audioContextRef.current)
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        return audioContextRef.current;
    }

    const unlockAudioContext = () => {
        const context = getAudioContext();
        if (!audioUnlockedRef.current) {
            const source = context.createBufferSource();
            source.buffer = context.createBuffer(1, 1, context.sampleRate);
            source.connect(context.destination);
            source.start(0);
            audioUnlockedRef.current = true;
        }
        if (context.state === 'suspended')
            void context.resume().catch((error) => console.warn('resume blueprint snap sound failed', error));
    }

    const playTone = (frequency: number, duration: number, gainValue: number, delay = 0) => {
        const context = getAudioContext();
        const play = () => {
            if (context.state === 'closed')
                return;
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(context.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = 'triangle';

            const startTime = context.currentTime + delay;
            const endTime = startTime + duration;
            gainNode.gain.setValueAtTime(0.0001, startTime);
            gainNode.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.012);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

            oscillator.start(startTime);
            oscillator.stop(endTime + 0.02);
        };

        if (context.state === 'suspended') {
            void context.resume()
                .then(play)
                .catch((error) => console.warn('play blueprint snap sound failed', error));
            return;
        }

        play();
    };

    // 新增：播放吸附音效
    const playSnapSound = () => {
        playTone(960, 0.08, 0.18);
    };

    const playConnectSound = () => {
        playTone(740, 0.06, 0.2);
        playTone(1180, 0.1, 0.24, 0.055);
    };

    const showSnapEffect = (element: HTMLElement) => element.classList.add(ANCHOR_SNAP_CLASS);

    const hideSnapEffect = (element: HTMLElement) => element.classList.remove(ANCHOR_SNAP_CLASS);

    const showStartHitEffect = (element: HTMLElement) => element.classList.add(ANCHOR_HIT_CLASS);

    const hideStartHitEffect = (element: HTMLElement) => element.classList.remove(ANCHOR_HIT_CLASS);

    // 新增：清除所有吸附效果
    const clearAllSnapEffects = () => {
        const anchors = bpLineContainerRef.current?.closest('.blue-print-canvas')?.querySelectorAll('.ap-circle') ?? [];
        anchors.forEach(anchor => {
            hideSnapEffect(anchor as HTMLElement);
            hideStartHitEffect(anchor as HTMLElement);
        });
    };

    const isAnchorType = (anchorElem: HTMLElement, anchorType: AnchorPointType) => {
        return anchorElem.id?.split(":")[2] === anchorType.toString();
    }

    const isAnchorDisabled = (anchorElem: HTMLElement) => {
        return !!anchorElem.closest('.bp-node-disabled');
    }

    const getViewport = () => bpLineContainerRef.current?.closest('.blue-print-canvas') as HTMLElement | null;

    const anchorCenterToCanvasPoint = (anchorElem: HTMLElement) => {
        const {canvasOffset} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const rect = anchorElem.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2 - canvasOffset.x,
            y: rect.top + rect.height / 2 - canvasOffset.y
        };
    }

    const findNearestAnchor = (mouseX: number, mouseY: number, anchorType: AnchorPointType, hitArea: AnchorHitArea): HTMLElement | null => {
        const viewport = getViewport();
        if (!isBPCanvasPointAvailable(mouseX, mouseY, viewport))
            return null;
        const anchors = viewport?.querySelectorAll('.ap-circle') ?? [];
        let nearestAnchor: HTMLElement | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const anchor of anchors) {
            const anchorElem = anchor as HTMLElement;
            if (!isAnchorType(anchorElem, anchorType) || isAnchorDisabled(anchorElem)) {
                continue;
            }

            const rect = anchorElem.getBoundingClientRect();
            const anchorCenterX = rect.left + rect.width / 2;
            const anchorCenterY = rect.top + rect.height / 2;
            const deltaX = mouseX - anchorCenterX;
            const deltaY = mouseY - anchorCenterY;
            const distance = deltaX * deltaX + deltaY * deltaY;
            const hit = hitArea.mode === 'radius'
                ? distance <= hitArea.radius * hitArea.radius
                : Math.abs(deltaX) <= hitArea.thresholdX && Math.abs(deltaY) <= hitArea.thresholdY;

            if (hit && distance < nearestDistance
                && isBPCanvasPointAvailable(anchorCenterX, anchorCenterY, viewport)) {
                nearestAnchor = anchorElem;
                nearestDistance = distance;
            }
        }

        return nearestAnchor;
    };

    const checkSnapToAnchor = (mouseX: number, mouseY: number): HTMLElement | null => {
        return findNearestAnchor(mouseX, mouseY, AnchorPointType.INPUT, {
            mode: 'rect',
            thresholdX: END_ANCHOR_SNAP_THRESHOLD_X,
            thresholdY: END_ANCHOR_SNAP_THRESHOLD_Y
        });
    };

    const checkStartAnchorHit = (mouseX: number, mouseY: number): HTMLElement | null => {
        return findNearestAnchor(mouseX, mouseY, AnchorPointType.OUTPUT, {
            mode: 'rect',
            thresholdX: START_ANCHOR_HIT_THRESHOLD_X,
            thresholdY: START_ANCHOR_HIT_THRESHOLD_Y
        });
    };

    const updateStartHitTarget = (nextTarget: HTMLElement | null) => {
        if (nextTarget === startHitTargetRef.current)
            return;
        if (startHitTargetRef.current)
            hideStartHitEffect(startHitTargetRef.current);
        if (nextTarget)
            showStartHitEffect(nextTarget);
        startHitTargetRef.current = nextTarget;
    };

    const isPointInBlueprintCanvas = (mouseX: number, mouseY: number) => {
        return isBPCanvasPointAvailable(mouseX, mouseY, getViewport());
    }

    const scheduleStartHitTargetUpdate = (mouseX: number, mouseY: number) => {
        if (!isPointInBlueprintCanvas(mouseX, mouseY)) {
            if (startHitFrameRef.current != null) {
                cancelAnimationFrame(startHitFrameRef.current);
                startHitFrameRef.current = null;
            }
            lastMousePointRef.current = null;
            updateStartHitTarget(null);
            return;
        }
        lastMousePointRef.current = {x: mouseX, y: mouseY};
        if (startHitFrameRef.current != null)
            return;
        startHitFrameRef.current = requestAnimationFrame(() => {
            startHitFrameRef.current = null;
            const point = lastMousePointRef.current;
            if (!point)
                return;
            updateStartHitTarget(checkStartAnchorHit(point.x, point.y));
        });
    };

    const bpMouseDown = (e: MouseEvent) => {
        if (!isPointInBlueprintCanvas(e.clientX, e.clientY))
            return;
        const {bluePrintManager} = window.DATAVISOOL_ENV.currentManager;
        const {currentPageManager} = bluePrintManager!;
        if (bluePrintManager.selectedLines && bluePrintManager.selectedLines.length > 0) {
            if (e.button === 0) {
                bluePrintManager.selectedLines.forEach(lineId => {
                    const graphics = bluePrintManager.lineInstances[lineId!];
                    const currentLine = currentPageManager!.bpLines[lineId!]!;
                    BpCanvasUtil.reDrawLine(currentLine, graphics);
                })
                if (!(e.target as Element).closest(".context-menu-container"))
                    bluePrintManager.setSelectedLines([]);
            }
        }
        if (e.button !== 0)
            return;
        const pointDom = checkStartAnchorHit(e.clientX, e.clientY);
        if (!pointDom)
            return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const {canvasOffset} = bluePrintManager;
        unlockAudioContext();
        //设置起始点坐标
        const {x, y, width, height} = pointDom.getBoundingClientRect();
        currentLineRef.current.startPoint = {x: x + width / 2 - canvasOffset.x, y: y + height / 2 - canvasOffset.y}
        currentLineRef.current.startAnchorId = pointDom.id;
        keyDownRef.current = true;
        keyMoveRef.current = false;

        // 新增：重置吸附目标
        snapTargetRef.current = null;
        lastSnapTargetRef.current = null;
        startHitTargetRef.current = null;
        clearAllSnapEffects();
    }

    const bpMouseMove = (e: MouseEvent) => {
        const bluePrintManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        if (!keyDownRef.current) {
            scheduleStartHitTargetUpdate(e.clientX, e.clientY);
            return;
        }
        keyMoveRef.current = true;
        const {startPoint} = currentLineRef.current;
        const {canvasOffset} = bluePrintManager;
        const pointAvailable = isPointInBlueprintCanvas(e.clientX, e.clientY);

        // 新增：检查吸附
        const snapTarget = pointAvailable ? checkSnapToAnchor(e.clientX, e.clientY) : null;
        let targetPoint = {x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y};

        if (!pointAvailable && lastSnapTargetRef.current) {
            hideSnapEffect(lastSnapTargetRef.current);
            lastSnapTargetRef.current = null;
            snapTargetRef.current = null;
        }

        // 处理吸附目标变化
        if (snapTarget !== lastSnapTargetRef.current) {
            // 清除上一个目标的悬浮效果
            if (lastSnapTargetRef.current) {
                hideSnapEffect(lastSnapTargetRef.current);
            }

            // 显示新目标的悬浮效果
            if (snapTarget) {
                showSnapEffect(snapTarget);
                playSnapSound();

                // 立即吸附到目标锚点中心
                targetPoint = anchorCenterToCanvasPoint(snapTarget);
            }

            lastSnapTargetRef.current = snapTarget;
            snapTargetRef.current = snapTarget;
        }

        // 如果当前有吸附目标，确保连线吸附到目标中心
        if (snapTarget) {
            targetPoint = anchorCenterToCanvasPoint(snapTarget);
        }

        //设置鼠标坐标
        currentLineRef.current.endPoint = targetPoint;

        const contPoi = BpCanvasUtil.calculateControlPoint(startPoint!, targetPoint);
        currentLineRef.current.firstCP = contPoi.firstCP;
        currentLineRef.current.secondCP = contPoi.secondCP;
        currentLineRef.current.color = bpLineConfig.connectingColor;
        currentLineRef.current.lineWidth = bpLineConfig.connectingWidth;
        BpCanvasUtil.reDrawLine(currentLineRef.current, dragLineRef.current!)
    }

    const bpMouseUp = (e: MouseEvent) => {
        const bluePrintManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const pointAvailable = isPointInBlueprintCanvas(e.clientX, e.clientY);
        let endElem = pointAvailable && e.target instanceof HTMLElement ? e.target : null;
        const finalSnapTarget = pointAvailable
            ? checkSnapToAnchor(e.clientX, e.clientY)
            : null;

        // 新增：如果当前有吸附目标，使用吸附目标作为结束元素
        if (finalSnapTarget) {
            endElem = finalSnapTarget;
        }

        // 新增：清除所有悬浮效果
        clearAllSnapEffects();

        if (!pointAvailable || !keyMoveRef.current || !keyDownRef.current || !endElem || !endElem.classList.contains('ap-circle')
            || endElem.id?.split(":")[2] !== AnchorPointType.INPUT.toString()) {
            //清空画布
            dragLineRef.current?.clear();
            keyDownRef.current = false;
            keyMoveRef.current = false;
            // 新增：清除吸附目标
            snapTargetRef.current = null;
            lastSnapTargetRef.current = null;
            return;
        }
        keyDownRef.current = false;
        keyMoveRef.current = false;
        //清空临时拖拽线
        dragLineRef.current?.clear();

        currentLineRef.current.id = IdGenerate.generateId();
        currentLineRef.current.lineWidth = bpLineConfig.lineWidth;
        currentLineRef.current.color = bpLineConfig.lineColor;
        currentLineRef.current.endAnchorId = endElem.id;
        currentLineRef.current.endPoint = anchorCenterToCanvasPoint(endElem);
        if (bluePrintManager.isRepeatLine(currentLineRef.current.startAnchorId!, currentLineRef.current.endAnchorId!)) {
            snapTargetRef.current = null;
            lastSnapTargetRef.current = null;
            return;
        }

        const copyLine = cloneDeep(currentLineRef.current);
        bpHistoryRecordOperateProxy.doAddLine(copyLine);
        playConnectSound();

        // 新增：清除吸附目标
        snapTargetRef.current = null;
        lastSnapTargetRef.current = null;
    }

    const hasViewport = Boolean(metrics && metrics.width > 0 && metrics.height > 0);
    useEffect(() => {
        if (!hasViewport)
            return undefined;

        const bluePrintManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const app = new Application();
        let active = true;
        let initSettled = false;
        let appDestroyed = false;
        let initialRenderTimer: ReturnType<typeof setInterval> | null = null;
        bluePrintManager.pixiApp = app;

        const removeDocumentListeners = () => {
            document.removeEventListener('mousedown', bpMouseDown, true);
            document.removeEventListener('mouseup', bpMouseUp);
            document.removeEventListener('mousemove', bpMouseMove);
        };

        const stopInitialLineRender = () => {
            if (initialRenderTimer !== null) {
                clearInterval(initialRenderTimer);
                initialRenderTimer = null;
            }
        };

        const destroyApp = () => {
            if (appDestroyed)
                return;
            appDestroyed = true;
            if (bluePrintManager.pixiApp === app) {
                bluePrintManager.pixiApp = null;
                bluePrintManager.lineInstances = {};
            }
            try {
                if (app.renderer)
                    app.destroy({removeView: true}, true);
                else
                    app.stage.destroy({children: true});
            } catch (error) {
                console.error('Failed to terminate the pixi instance ', error);
            }
        };

        const scheduleInitialLineRender = (pageId: string) => {
            let attempts = 0;
            initialRenderTimer = setInterval(() => {
                if (!active || bluePrintManager.pixiApp !== app) {
                    stopInitialLineRender();
                    return;
                }
                const pageManager = bluePrintManager.currentPageManager;
                if (!pageManager || pageManager.pageId !== pageId) {
                    stopInitialLineRender();
                    return;
                }
                const nodeCount = Object.keys(pageManager.bpNodeLayoutMap).length;
                if (Object.keys(bluePrintManager.currPageNodeControllers).length === nodeCount) {
                    stopInitialLineRender();
                    BpCanvasUtil.reRenderAllLine();
                    syncBpAnchorColorsFromLines(Object.values(pageManager.bpLines));
                    return;
                }
                attempts++;
                if (attempts >= 60)
                    stopInitialLineRender();
            }, 50);
        };

        const initApp = async () => {
            const initialMetrics = metricsRef.current;
            if (!initialMetrics)
                return;
            try {
                await app.init({
                    width: initialMetrics.width,
                    height: initialMetrics.height,
                    antialias: true,
                    backgroundAlpha: 0,
                    resolution: initialMetrics.resolution,
                    autoDensity: true,
                    // Blueprint lines only need WebGL; avoid the optional WebGPU module
                    // blocking canvas and connection listeners when it cannot be loaded.
                    preference: 'webgl'
                });
                initSettled = true;
                if (!active) {
                    destroyApp();
                    return;
                }

                const lineLayer = bpLineContainerRef.current;
                if (!app.canvas || !lineLayer)
                    throw new Error('Blueprint Pixi canvas host is unavailable');

                app.stage.interactive = true;
                lineLayer.appendChild(app.canvas);
                const latestMetrics = metricsRef.current;
                if (latestMetrics && latestMetrics.width > 0 && latestMetrics.height > 0)
                    app.renderer.resize(latestMetrics.width, latestMetrics.height, latestMetrics.resolution);

                const pageId = bluePrintManager.currentPageManager?.pageId;
                if (pageId)
                    scheduleInitialLineRender(pageId);

                document.addEventListener('mousedown', bpMouseDown, true);
                document.addEventListener('mouseup', bpMouseUp);
                document.addEventListener('mousemove', bpMouseMove);
                const tempLine = new Graphics();
                app.stage.addChild(tempLine);
                dragLineRef.current = tempLine;
            } catch (error) {
                initSettled = true;
                removeDocumentListeners();
                stopInitialLineRender();
                if (active)
                    console.error('Failed to initialize the blueprint pixi instance ', error);
                destroyApp();
            }
        };

        void initApp();

        return () => {
            active = false;
            stopInitialLineRender();
            if (startHitFrameRef.current !== null) {
                cancelAnimationFrame(startHitFrameRef.current);
                startHitFrameRef.current = null;
            }
            lastMousePointRef.current = null;
            updateStartHitTarget(null);
            clearAllSnapEffects();
            snapTargetRef.current = null;
            lastSnapTargetRef.current = null;
            keyDownRef.current = false;
            keyMoveRef.current = false;
            dragLineRef.current = undefined;
            removeDocumentListeners();

            const audioContext = audioContextRef.current;
            audioContextRef.current = null;
            audioUnlockedRef.current = false;
            if (audioContext && audioContext.state !== 'closed')
                void audioContext.close().catch((error) => console.warn('close blueprint snap sound failed', error));

            if (initSettled)
                destroyApp();
        };
        // The Pixi application lifetime ends only when a usable viewport disappears; handlers read live page state through the manager and refs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasViewport]);


    return <div className="bp-line-layer" ref={bpLineContainerRef}/>;
}
