/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {CSSProperties, ForwardedRef, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from "react";
import {flushSync} from "react-dom";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import './BaseTableComponent.less';
import {debounce} from "lodash";
import {DesignerMode} from "@datavisool/sdk/types";

export interface ITableColumn {
    key: string;
    label: string;
    width?: number;
    textAlign?: 'left' | 'center' | 'right';
}

export interface ITableHeaderStyle {
    height?: number;
    background?: string;
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
}

export interface ITableBodyStyle {
    background?: string;
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    enableZebra?: boolean;
    zebraColor?: string;
    enableCarousel?: boolean;
    carouselSpeed?: number;
    carouselPauseSeconds?: number;
    pageSize?: number;
    lineBackground?: string | string[];
}

export interface BaseTableComponentStyle {
    columns?: ITableColumn[];
    data?: object[];
    header?: ITableHeaderStyle;
    body?: ITableBodyStyle;
}

export interface BaseTableComponentProps extends ComponentBaseProps {
    style?: BaseTableComponentStyle;
}

export interface BaseTableComponentRef {
    updateConfig: (newConfig: BaseTableComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    destroy: () => void;
    changeVisible: (visible: boolean) => void;
    setCarouselState: (state: Partial<TableCarouselState>) => void;
    resetCarouselState: () => void;
    advanceCarouselRows: (shift?: number) => void;
    resetCarouselRows: (length?: number) => void;
    getCarouselMetrics: () => TableCarouselMetrics;
}

export interface TableCarouselState {
    offset: number;
    transitionMs: number;
}

export interface TableCarouselMetrics {
    rowStep: number;
    dataLength: number;
}

const createRowOrder = (length: number) => Array.from({length}, (_, index) => index);

const rotateRowOrder = (order: number[], shift = 1) => {
    if (order.length <= 1)
        return order.slice();
    const normalizedShift = ((shift % order.length) + order.length) % order.length;
    if (normalizedShift === 0)
        return order.slice();
    return [...order.slice(normalizedShift), ...order.slice(0, normalizedShift)];
};

const BaseTableComponent = forwardRef((props: BaseTableComponentProps, ref: ForwardedRef<BaseTableComponentRef>) => {
    const [config, setConfig] = useState<BaseTableComponentProps>({...props});
    const [visible, setVisible] = useState(true);
    const tableRef = useRef<HTMLDivElement | null>(null);
    const theadRef = useRef<HTMLTableSectionElement | null>(null);
    const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const contentHeightRef = useRef(0);
    const [rowOrder, setRowOrder] = useState<number[]>(() => createRowOrder(props.style?.data?.length ?? 0));
    const [carouselState, setCarouselState] = useState<TableCarouselState>({
        offset: 0,
        transitionMs: 0,
    });

    const {columns = [], data = [], header = {}, body = {}} = config.style ?? {};
    const tableColumns = Array.isArray(columns) ? columns : [];
    const tableData = Array.isArray(data) ? data : [];

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => setConfig({...newConfig}),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        destroy: destroy,
        changeVisible: (visible: boolean) => setVisible(visible),
        setCarouselState: (state) => setCarouselState((prev) => ({...prev, ...state})),
        resetCarouselState: () => setCarouselState((prev) => ({...prev, offset: 0, transitionMs: 0})),
        advanceCarouselRows: (shift = 1) => {
            flushSync(() => {
                setRowOrder((prev) => rotateRowOrder(prev.length > 0 ? prev : createRowOrder(tableData.length), shift));
                setCarouselState((prev) => ({...prev, offset: 0, transitionMs: 0}));
            });
        },
        resetCarouselRows: (length = tableData.length) => {
            flushSync(() => {
                setRowOrder(createRowOrder(length));
                setCarouselState((prev) => ({...prev, offset: 0, transitionMs: 0}));
            });
        },
        getCarouselMetrics: () => ({
            rowStep: getRowStep(),
            dataLength: tableData.length,
        }),
    }));

    const onClick = () => {
        if ('click' in eventHandlerMap.current) {
            eventHandlerMap.current['click']();
        }
    }

    const destroy = () => {
        tableRef && (tableRef.current = null);
        theadRef && (theadRef.current = null);
        tbodyRef && (tbodyRef.current = null);
        resizeObserverRef && resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
    }

    const changeTableTrHeight = useCallback(() => {
        const pageSize = Number(config.style?.body?.pageSize ?? config.style?.data?.length ?? 0);
        if (pageSize > 0) {
            const tableBodyTds = tableRef.current?.getElementsByClassName('base-table-tr') || [];
            const tdHeight = contentHeightRef.current! / pageSize;
            for (let i = 0; i < tableBodyTds.length; i++) {
                (tableBodyTds[i] as HTMLElement).style.height = `${tdHeight}px`;
            }
        }
    }, [config.style]);

    const getContentHeight = useCallback(() => {
        return Math.max(0, (tableRef.current?.clientHeight ?? 0) - (theadRef.current?.clientHeight ?? 0));
    }, []);

    const getRowStep = useCallback(() => {
        const pageSize = Number(config.style?.body?.pageSize ?? 0);
        const contentHeight = getContentHeight();
        if (pageSize > 0 && contentHeight > 0)
            return contentHeight / pageSize;
        return tbodyRef.current?.querySelector<HTMLTableRowElement>('.base-table-tr')?.getBoundingClientRect().height ?? 0;
    }, [config.style?.body?.pageSize, getContentHeight]);

    const calculateLineBgColor = (lineBackground?: string | string[]): [string, string] => {
        if (typeof lineBackground === "string") {
            return [lineBackground, lineBackground];
        } else if (Array.isArray(lineBackground)) {
            return [
                lineBackground[0] || "#00000000",
                lineBackground[1] || "#00000000"
            ];
        }
        return ["#00000000", "#00000000"];
    };


    useEffect(() => {
        if (!tableRef.current) {
            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = null;
            return;
        }
        contentHeightRef.current = getContentHeight();
        if (window.DATAVISOOL_ENV.mode === DesignerMode.EDIT) {
            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = new ResizeObserver(debounce((entries) => {
                for (const entry of entries) {
                    const {height} = entry.contentRect;
                    contentHeightRef.current = height - (theadRef.current?.clientHeight ?? 0);
                }
                changeTableTrHeight();
            }, 100));
            resizeObserverRef.current!.observe(tableRef.current);
        }
        changeTableTrHeight();
        return () => {
            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = null;
        };
    }, [changeTableTrHeight, getContentHeight, visible]);

    useEffect(() => {
        setRowOrder(createRowOrder(tableData.length));
        setCarouselState((prev) => ({...prev, offset: 0, transitionMs: 0}));
    }, [tableData.length]);

    if (!visible)
        return null;

    const bodyConfig = body as ITableBodyStyle;
    const {enableCarousel, lineBackground} = bodyConfig;
    const bodyStyle = {...bodyConfig} as CSSProperties & ITableBodyStyle;
    delete bodyStyle.enableCarousel;
    delete bodyStyle.carouselSpeed;
    delete bodyStyle.carouselPauseSeconds;
    delete bodyStyle.pageSize;
    delete bodyStyle.lineBackground;
    const trackTranslate = `translate3d(0, ${carouselState.offset}px, 0)`;
    const trackTransition = carouselState.transitionMs > 0
        ? `transform ${carouselState.transitionMs}ms linear`
        : 'none';
    const trackStyle: CSSProperties = {
        ...bodyStyle,
        position: 'relative',
        zIndex: 0,
        transform: trackTranslate,
        transition: trackTransition,
        willChange: enableCarousel ? 'transform' : undefined,
    };
    const resolvedRowOrder = rowOrder.length === tableData.length ? rowOrder : createRowOrder(tableData.length);
    const [lineBgColor1, lineBgColor2] = calculateLineBgColor(lineBackground);
    const headerHeight = typeof header?.height === "number" && Number.isFinite(header.height)
        ? Math.max(0, header.height)
        : undefined;
    const headerHeightStyle = typeof headerHeight === "number" ? `${headerHeight}px` : undefined;
    const tableHeaderStyle: CSSProperties = {
        ...header,
        height: headerHeightStyle,
        position: 'sticky',
        top: 0,
        zIndex: 3,
    };
    const headerCellStyle = headerHeightStyle
        ? {
            height: headerHeightStyle,
            lineHeight: headerHeightStyle,
            padding: "0 8px",
            whiteSpace: "nowrap" as const,
            verticalAlign: "middle" as const,
            position: "relative" as const,
            zIndex: 3,
            background: header?.background,
        }
        : {
            position: "relative" as const,
            zIndex: 3,
            background: header?.background,
        };
    const renderColGroup = () => (
        <colgroup>
            {tableColumns.map((column: ITableColumn, index: number) => (
                <col key={index} style={column.width ? {width: column.width} : undefined}/>
            ))}
        </colgroup>
    );
    return (
        <div className={'base-table'} ref={tableRef} onClick={onClick}>
            <div className="table-container" style={{background: header?.background}}></div>
            <div className="table-content">
                <table className="base-table-header-table">
                    {renderColGroup()}
                    <thead style={tableHeaderStyle} ref={theadRef}>
                    <tr style={headerHeightStyle ? {height: headerHeightStyle} : undefined}>
                        {tableColumns.map((column: ITableColumn, index: number) => {
                            return <th key={index}
                                       style={{
                                           width: column.width,
                                           fontWeight: header?.fontWeight,
                                           fontSize: header?.fontSize,
                                           color: header?.color,
                                           textAlign: column.textAlign,
                                           fontFamily: header?.fontFamily,
                                           ...headerCellStyle,
                                       }}>{column.label}</th>
                        })}
                    </tr>
                    </thead>
                </table>
                <div className="base-table-body-viewport">
                    <table className="base-table-body-table">
                        {renderColGroup()}
                        <tbody style={trackStyle} className="scroll-body" ref={tbodyRef}>
                        {
                            resolvedRowOrder.map((sourceIndex: number) => {
                                const item = tableData[sourceIndex] as Record<string, any>;
                                return (
                                    <tr key={sourceIndex} className={'base-table-tr'} style={{background: sourceIndex % 2 === 0 ? lineBgColor1 : lineBgColor2}}>
                                        {tableColumns.map((column: ITableColumn, i: number) => {
                                            return <td key={i}
                                                       style={{
                                                           textAlign: column.textAlign
                                                       }}>{item[column.key]}</td>
                                        })}
                                    </tr>
                                )
                            })
                        }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
})

export default BaseTableComponent;
