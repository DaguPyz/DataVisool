/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import {useCallback, useEffect, useRef} from 'react';
import './CompList.less';
import {observer} from "mobx-react";
import {IdGenerate} from "@datavisool/sdk";
import type {ComponentListStore} from '@/plugins/editor-component-library/ComponentListStore.ts';
import {ILayerItem} from "@datavisool/sdk/types";
import {tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';

const CompList = observer(({canvas, catalog, store}: {canvas: EditorCanvasService; catalog: DesignerCatalog; store: ComponentListStore}) => {
    useLocaleVersion();
    const scene = useEditorScene();
    const dragRef = useRef<{
        compKey: string;
        sceneVersion: number;
        ghost: HTMLDivElement;
    } | null>(null);

    const stopDraggingRef = useRef<() => void>(() => undefined);

    const addItem = useCallback((compKey: string, position = [0, 0]) => {
        if (!store.isAccepting) return;
        const baseInfo = catalog.getComponent(compKey)?.baseInfo;
        if (!baseInfo) return;
        const {compName, width = 320, height = 200} = baseInfo;

        const movableItem: ILayerItem = {
            name: compName,
            type: compKey,
            x: Math.round(position[0]),
            y: Math.round(position[1]),
            id: IdGenerate.generateId(),
            lock: false,
            hide: false,
            width,
            height,
        };
        //标识本次操作为手动添加组件，与回滚撤销区分开
        canvas.insertLayer(movableItem);
    }, [canvas, catalog, store]);

    useEffect(() => {
        const unregisterPauseCleanup = store.registerPauseCleanup(() => stopDraggingRef.current());
        return () => {
            unregisterPauseCleanup();
            stopDraggingRef.current();
        };
    }, [store]);

    const handleMouseMove = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;
        current.ghost.style.left = `${event.clientX + 12}px`;
        current.ghost.style.top = `${event.clientY + 12}px`;

        const drop = canvas.resolveDrop(event);
        document.body.style.cursor = drop && !drop.within ? 'not-allowed' : 'grabbing';
    }, [canvas]);

    const handleMouseUp = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;

        const drop = canvas.resolveDrop(event);
        if (store.isAccepting && drop?.within && canvas.isSceneActive(current.sceneVersion))
            addItem(current.compKey, [drop.position.x, drop.position.y]);

        stopDraggingRef.current();
    }, [addItem, canvas, store]);

    const stopDragging = useCallback(() => {
        const current = dragRef.current;
        if (!current) return;
        try {
            current.ghost.remove();
        } catch (e) {
            console.error('[CompList] remove ghost failed', e);
        }
        dragRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMove, true);
        window.removeEventListener('mouseup', handleMouseUp, true);
    }, [handleMouseMove, handleMouseUp]);

    useEffect(() => {
        stopDraggingRef.current = stopDragging;
    }, [stopDragging]);

    useEffect(() => {
        stopDraggingRef.current();
    }, [scene?.version]);

    const startDragging = (compKey: string, compName: string, chartImg?: string) => {
        stopDragging();
        const sceneVersion = scene?.version;
        if (!store.isAccepting || sceneVersion === undefined || !canvas.isSceneActive(sceneVersion)) return;

        const ghost = document.createElement('div');
        ghost.style.position = 'fixed';
        ghost.style.left = '0';
        ghost.style.top = '0';
        ghost.style.zIndex = '99999';
        ghost.style.pointerEvents = 'none';
        ghost.style.background = 'rgba(0, 0, 0, 0.75)';
        ghost.style.color = '#fff';
        ghost.style.borderRadius = '6px';
        ghost.style.padding = '8px';
        ghost.style.display = 'flex';
        ghost.style.gap = '8px';
        ghost.style.alignItems = 'center';
        ghost.style.maxWidth = '260px';
        ghost.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.35)';

        if (chartImg) {
            const img = document.createElement('img');
            img.src = chartImg;
            img.style.width = '48px';
            img.style.height = '48px';
            img.style.objectFit = 'contain';
            img.style.background = 'rgba(255, 255, 255, 0.12)';
            img.style.borderRadius = '4px';
            ghost.appendChild(img);
        }

        const text = document.createElement('div');
        text.textContent = compName;
        text.style.fontSize = '12px';
        text.style.lineHeight = '16px';
        ghost.appendChild(text);

        document.body.appendChild(ghost);
        dragRef.current = {compKey, sceneVersion, ghost};
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseup', handleMouseUp, true);
    };

    const getChartDom = () => {
        const {search, categories, subCategories, compInfoArr} = store;
        const keyword = search.trim().toLowerCase();
        const compArr = compInfoArr.filter(({baseInfo}) =>
            (categories === "all" || baseInfo.categorize === categories) &&
            (subCategories === "all" || baseInfo.subCategorize === subCategories) &&
            (!keyword || baseInfo.compName.toLowerCase().includes(keyword) || tx(baseInfo.compName).toLowerCase().includes(keyword))
        );

        return compArr.map(({key: compKey, baseInfo, chartImage}) => {
            const {compName} = baseInfo;
            const displayCompName = tx(compName);
            const chartImg = chartImage;

            return (
                <button type="button" key={compKey} className="list-item droppable-element" aria-label={displayCompName}
                     onMouseDown={(e) => {
                         if (e.button !== 0) return;
                         e.preventDefault();
                         e.stopPropagation();
                         startDragging(compKey, displayCompName, chartImg || undefined);
                         handleMouseMove(e.nativeEvent);
                     }}
                     onClick={(event) => { if (event.detail === 0) addItem(compKey); }}
                     onDoubleClick={() => addItem(compKey)}
                     data-type={compKey}>
                    <div className="item-event-container">
                        <div className="item-content" data-empty={chartImg ? undefined : 'true'}>
                            {chartImg && (
                                <img
                                    src={chartImg}
                                    alt={displayCompName}
                                    loading="lazy"
                                    decoding="async"
                                    draggable={false}
                                    onError={(event) => {
                                        event.currentTarget.style.display = 'none';
                                        event.currentTarget.parentElement?.setAttribute('data-empty', 'true');
                                    }}
                                />
                            )}
                        </div>
                        <div className="item-header">
                            <div className="item-name">{displayCompName}</div>
                        </div>
                    </div>
                </button>
            );
        });
    };

    const cards = getChartDom();
    return (
        <>
            <div className="list-items" id="component-drag-container">
                {cards.length ? cards : <div className="list-empty" role="status">{tx('无匹配组件')}</div>}
            </div>
        </>
    );
});

export default CompList;
