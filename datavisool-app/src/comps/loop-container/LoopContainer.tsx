/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {CSSProperties, ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import {flushSync} from "react-dom";
import './LoopContainer.less';
import {LoopContainerProps} from "./LoopContainerController.ts";
import CanvasRender from "@/designer/left/layer-list/CanvasRender.ts";
import {DesignerMode} from "@datavisool/sdk/types";
import {isComponentReady, onComponentReady} from "@/designer/blueprint/util/ComponentLoadTracker";

export interface ILoopContainerStyle {
    overflow?: string;
    flexDirection?: string;
    flexWrap?: string;
    horizontalGap?: number;
    verticalGap?: number;
    enableCarousel?: boolean;
    carouselDirection?: 'row' | 'column';
    carouselSpeed?: number;
    carouselPauseSeconds?: number;
}

interface CarouselState {
    offset: number;
    transitionMs: number;
    direction: 'row' | 'column';
}

export interface LoopContainerInstance {
    updateConfig: (newConfig: LoopContainerProps) => void;
    updateVisible: (visible: boolean) => void;
    setEventHandler: (eventMap: Record<string, (...args: any[]) => any>) => void;
    setCarouselState: (state: Partial<CarouselState>) => void;
    resetCarouselState: () => void;
    advanceCarouselSlots: (shift?: number) => void;
    resetCarouselSlots: (length?: number) => void;
}

const createSlotOrder = (length: number) => Array.from({length}, (_, index) => index);

const rotateSlotOrder = (order: number[], shift = 1) => {
    if (order.length <= 1)
        return order.slice();
    const normalizedShift = ((shift % order.length) + order.length) % order.length;
    if (normalizedShift === 0)
        return order.slice();
    return [...order.slice(normalizedShift), ...order.slice(0, normalizedShift)];
};

const LoopContainer = forwardRef((props: LoopContainerProps, ref: ForwardedRef<LoopContainerInstance>) => {
    const {manager, ...cfg} = props;
    const loopContainerRef = useRef<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(true);
    const [config, setConfig] = useState<LoopContainerProps>({...cfg ?? {}});
    const loadedControllerRef = useRef<Set<any>>(new Set());
    const [slotOrder, setSlotOrder] = useState<number[]>(() => createSlotOrder(cfg?.data?.value?.length ?? 0));
    const [carouselState, setCarouselState] = useState<CarouselState>({
        offset: 0,
        transitionMs: 0,
        direction: (cfg?.style?.carouselDirection ?? cfg?.style?.flexDirection ?? 'column') as 'row' | 'column',
    });

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => {
            setConfig({...newConfig});
            setCarouselState((prev) => ({
                ...prev,
                direction: (newConfig?.style?.carouselDirection
                    ?? newConfig?.style?.flexDirection
                    ?? prev.direction) as 'row' | 'column',
            }));
        },
        updateVisible: (visible) => setVisible(visible),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        setCarouselState: (state) => setCarouselState((prev) => ({...prev, ...state})),
        resetCarouselState: () => setCarouselState((prev) => ({...prev, offset: 0, transitionMs: 0})),
        advanceCarouselSlots: (shift = 1) => {
            flushSync(() => {
                setSlotOrder((prev) => rotateSlotOrder(prev.length > 0 ? prev : createSlotOrder(value.length), shift));
                setCarouselState((prev) => ({...prev, offset: 0, transitionMs: 0}));
            });
        },
        resetCarouselSlots: (length = value.length) => {
            flushSync(() => {
                setSlotOrder(createSlotOrder(length));
                setCarouselState((prev) => ({...prev, offset: 0, transitionMs: 0}));
            });
        },
    }));

    const eventHandlerMap = useRef<Record<string, (...args: any[]) => any>>({});

    const onClick = () => {
        if ('click' in eventHandlerMap.current)
            eventHandlerMap.current['click']();
    }

    const {width = 0, height = 0} = manager?.canvasManager?.canvasConfig ?? {};
    const globalFilter = manager?.globalFilterManger.getFilterStyle() ?? {};
    const {value = []} = config?.data ?? {};
    const {
        overflow,
        flexDirection,
        flexWrap,
        gap,
        horizontalGap,
        verticalGap,
        enableCarousel,
        carouselDirection,
        ...containerStyle
    } = (config?.style ?? {}) as ILoopContainerStyle & CSSProperties;
    const resolvedHorizontalGap = Number(horizontalGap ?? gap ?? 0) || 0;
    const resolvedVerticalGap = Number(verticalGap ?? gap ?? 0) || 0;
    const runtimeDirection = (enableCarousel
        ? (carouselState.direction ?? carouselDirection ?? flexDirection ?? 'column')
        : (flexDirection ?? 'column')) as 'row' | 'column';
    const outerOverflow = enableCarousel ? 'hidden' : (overflow ?? 'hidden');
    const trackWrap = enableCarousel ? 'nowrap' : (flexWrap ?? 'nowrap');
    const trackTranslate = runtimeDirection === 'row'
        ? `translate3d(${carouselState.offset}px, 0, 0)`
        : `translate3d(0, ${carouselState.offset}px, 0)`;
    const trackTransition = carouselState.transitionMs > 0
        ? `transform ${carouselState.transitionMs}ms linear`
        : 'none';

    useEffect(() => {
        setSlotOrder(createSlotOrder(value.length));
    }, [value.length]);

    useEffect(() => {
        if (!visible || window.DATAVISOOL_ENV.mode === DesignerMode.EDIT || !manager)
            return;
        const triggerLoaded = (controller: any) => {
                const componentId = controller?.config?.base?.id;
                const type = controller?.config?.base?.type;
                if (!controller || !componentId || type === 'group' || type === 'LoopContainer' || type === 'MapLibreGis')
                    return;
                if (!isComponentReady(controller))
                    return;
                if (loadedControllerRef.current.has(controller))
                    return;
                loadedControllerRef.current.add(controller);
                manager.bpExecutor?.triggerComponentEvent(componentId, 'loaded', controller.config, controller.index);
        };
        const unsubscribe = onComponentReady(manager, controller => {
            if (Object.values(manager.layerManager.controllers ?? {}).includes(controller)) triggerLoaded(controller);
        });
        let count = 0;
        const timer = window.setInterval(() => {
            Object.values(manager.layerManager.controllers ?? {}).forEach(triggerLoaded);
            count++;
            if (count > 100)
                clearInterval(timer);
        }, 50);
        return () => {
            clearInterval(timer);
            unsubscribe();
        };
    }, [manager, visible, value.length]);

    return (
        <>
            {
                visible && <div className={'loop-container'} ref={loopContainerRef} onClick={onClick}
                                style={{...containerStyle, overflow: outerOverflow}}>
                    <div
                        className="loop-track"
                        style={{
                            display: 'flex',
                            flexDirection: runtimeDirection,
                            flexWrap: trackWrap as CSSProperties['flexWrap'],
                            rowGap: resolvedVerticalGap,
                            columnGap: resolvedHorizontalGap,
                            transform: trackTranslate,
                            transition: trackTransition,
                            willChange: 'transform',
                        }}
                    >
                        {
                            (slotOrder.length === value.length ? slotOrder : createSlotOrder(value.length)).map((slotIndex: number) => {
                                return <div key={slotIndex} style={{width, height, ...globalFilter}} className="loop-item">
                                    {CanvasRender.buildCanvasComponents(manager!, '-loop', slotIndex)}
                                </div>
                            })
                        }
                    </div>
                </div>
            }
        </>
    )
})

export default LoopContainer;
