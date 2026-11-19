/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import { useCallback, useEffect, useRef, useState } from "react";
import { ILayerItem } from "@datavisool/sdk/types";
import './ImageSource.less';
import {IdGenerate} from "@datavisool/sdk";
import { IImageData } from "@/comps/builtin/base-image/BaseImageComponent";
import {Input} from "@datavisool/ui";
import { Close, Search } from "@icon-park/react";
import baseApi from "@/api/engineering/BaseApi.ts";
import ServerOperator from "@/api/engineering/BaseApi.ts";
import { globalMessage } from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";
import type {ResourceLibraryLifecycle} from '../ResourceLibraryLifecycle.ts';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';


export default function ImageSource({canvas, catalog, lifecycle}: {canvas: EditorCanvasService; catalog: DesignerCatalog; lifecycle: ResourceLibraryLifecycle}) {

    const scene = useEditorScene();
    const [imageList, setImageList] = useState<IImageData[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const mountedRef = useRef(false);
    const requestVersionRef = useRef(0);
    const deleteModalRef = useRef<string>();
    const dragRef = useRef<{
        url: string;
        hash?: string;
        sceneVersion: number;
        ghost: HTMLDivElement;
    } | null>(null);

    const addItem = (compKey: string, position = [0, 0], url: string, hash?: string) => {
        if (!lifecycle.isAccepting()) return;
        const component = catalog.getComponent(compKey);
        const initConfig = catalog.createInitialConfig(compKey);
        if (!component || !initConfig) return;
        const {compName, width = 320, height = 200} = component.baseInfo;
        const id = IdGenerate.generateId();
        const movableItem: ILayerItem = {
            name: compName,
            type: compKey,
            x: Math.round(position![0]),
            y: Math.round(position![1]),
            id,
            lock: false,
            hide: false,
            width,
            height,
        }

        //图片资源拖拽要提前设置好图片地址
        const style = initConfig.style as Record<string, unknown> | undefined;
        const base = initConfig.base as Record<string, unknown> | undefined;
        if (!style || !base) return;
        style.type = 'local';
        style.localUrl = url;
        style.hash = hash;
        base.id = id;
        canvas.insertLayer(movableItem, {...initConfig});
    }

    const stopDraggingRef = useRef<() => void>(() => undefined);

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
        if (drop?.within && lifecycle.isAccepting() && canvas.isSceneActive(current.sceneVersion))
            addItem("BaseImage", [drop.position.x, drop.position.y], current.url, current.hash);

        stopDraggingRef.current();
    }, [canvas, lifecycle]);

    const stopDragging = useCallback(() => {
        const current = dragRef.current;
        if (!current) return;
        try {
            current.ghost.remove();
        } catch (e) {
            console.error("Failed to remove ghost element:", e);
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

    const startDragging = (url: string, name: string, hash?: string) => {
        stopDragging();
        const sceneVersion = scene?.version;
        if (!lifecycle.isAccepting() || sceneVersion === undefined || !canvas.isSceneActive(sceneVersion)) return;

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

        const text = document.createElement('div');
        text.textContent = name || '未命名图片';
        text.style.fontSize = '12px';
        text.style.lineHeight = '16px';
        ghost.appendChild(text);

        document.body.appendChild(ghost);
        dragRef.current = { url, hash, sceneVersion, ghost };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseup', handleMouseUp, true);
    };

    const getImageList = useCallback(async () => {
        const version = ++requestVersionRef.current;
        try {
            const data = await baseApi.getImageSourceList();
            if (mountedRef.current && lifecycle.isActive() && version === requestVersionRef.current)
                setImageList(data);
            return data;
        } catch (error) {
            if (mountedRef.current && lifecycle.isActive() && version === requestVersionRef.current)
                console.error('加载图片资源失败', error);
            return undefined;
        }
    }, [lifecycle]);

    useEffect(() => {
        mountedRef.current = true;
        getImageList();
        const unregisterPauseCleanup = lifecycle.registerPauseCleanup(() => stopDraggingRef.current());
        return () => {
            mountedRef.current = false;
            requestVersionRef.current++;
            unregisterPauseCleanup();
            stopDragging();
            if (deleteModalRef.current) globalModal.modalApi?.destroy(deleteModalRef.current);
        };
    }, [getImageList, lifecycle, stopDragging]);

    const confirmDel = (imageId: string) => {
        if (!lifecycle.isAccepting()) return;
        deleteModalRef.current = globalModal.modalApi?.confirm({
            title: "确认删除吗?",
            content: "可能会导致已经使用的图片组件失效!",
            okText: "是",
            cancelText: "否",
            onOk: async () => {
                if (!lifecycle.isAccepting()) return false;
                const deletion = lifecycle.trackTask((async () => {
                    const data = await ServerOperator.delImageSource(imageId);
                    if (data) {
                        await getImageList();
                        if (lifecycle.isActive()) globalMessage.messageApi?.success("已删除");
                    }
                    return data;
                })());
                try { return await deletion; }
                catch (error) {
                    if (lifecycle.isActive()) globalMessage.messageApi?.error("删除失败");
                    return false;
                }
            },
            afterClose: () => { deleteModalRef.current = undefined; },
        });
    }

    const normalizedSearch = searchValue.trim().toLowerCase();
    const visibleImageList = normalizedSearch
        ? imageList.filter((item) => (item.name || '').toLowerCase().includes(normalizedSearch))
        : imageList;

    return <div className={'image-source'}>
        <div className={'image-source-search'}>
            <Input
                placeholder="搜索图片"
                inputSize="sm"
                allowClear
                prefix={<Search size={14} fill="currentColor"/>}
                value={searchValue}
                onChange={setSearchValue}
            />
        </div>
        <div className={'image-source-list'} id={'image-source-list'}>
            {
                visibleImageList.map((item: IImageData, index: number) => {
                    return <div className={'image-source-item droppable-element'} key={index} role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); addItem('BaseImage', [0, 0], AssetUrlUtil.toLoadableUrl(item.url) || item.url, item.hash); } }}
                        onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            startDragging(AssetUrlUtil.toLoadableUrl(item.url) || item.url, item.name || '', item.hash);
                            handleMouseMove(e.nativeEvent);
                        }}
                        onDoubleClick={() => addItem("BaseImage", [0, 0], AssetUrlUtil.toLoadableUrl(item.url) || item.url, item.hash)}
                        data-url={item.url}
                        data-hash={item.hash}>
                        <div className={'image-source-item-header'}>
                            <div className={'isi-title'}>{item.name || '无名称信息'}</div>
                            <div className={'isi-operate'}>
                                <div className={'isi-operate-btn'} onMouseDown={(e) => e.stopPropagation()} onClick={() => confirmDel(item.id!)}>
                                    <Close />
                                </div>
                            </div>
                        </div>
                        <div className={'image-source-item-body'}>
                            <div className={'item-bg-image'} style={{ backgroundImage: `url(${AssetUrlUtil.toLoadableUrl(item.url) || item.url})` }} />
                        </div>
                    </div>
                })
            }
        </div>
    </div>;
}
