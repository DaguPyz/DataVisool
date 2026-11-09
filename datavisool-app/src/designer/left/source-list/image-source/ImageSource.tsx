/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ILayerItem } from "@datavisool/sdk/types";
import './ImageSource.less';
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {IdGenerate} from "@datavisool/sdk";
import type {BaseImageComponentProps} from "@/comps/builtin/base-image/BaseImageController";
import { IImageData } from "@/comps/builtin/base-image/BaseImageComponent";
import {Input} from "@datavisool/ui";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import { Close, Search } from "@icon-park/react";
import baseApi from "@/api/engineering/BaseApi.ts";
import ServerOperator from "@/api/engineering/BaseApi.ts";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import { globalMessage } from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";
import {getMainCanvasDropPoint} from "@/designer/workspace/viewport/ArtboardDropTarget.ts";


export default function ImageSource() {

    const [imageList, setImageList] = useState<IImageData[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const dragRef = useRef<{
        url: string;
        hash?: string;
        ghost: HTMLDivElement;
    } | null>(null);

    const addItem = (compKey: string, position = [0, 0], url: string, hash?: string) => {
        const { elemConfigs } = window.DATAVISOOL_ENV.currentManager.layerManager;
        const { setAddRecordCompId } = eventOperateStore;
        const definition = DesignerLoader.definitionMap[compKey];
        const { compName, width = 320, height = 200 } = definition.getBaseInfo();
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
        setAddRecordCompId(movableItem.id!)
        historyRecordOperateProxy.doAdd(movableItem);

        //图片资源拖拽要提前设置好图片地址
        const initConfig: BaseImageComponentProps = definition.getInitConfig();
        initConfig.style!.type = 'local';
        initConfig.style!.localUrl = url;
        initConfig.style!.hash = hash;
        initConfig['base']!['id'] = id;
        elemConfigs![id] = initConfig;
    }

    const stopDraggingRef = useRef<() => void>(() => undefined);

    const handleMouseMove = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;
        current.ghost.style.left = `${event.clientX + 12}px`;
        current.ghost.style.top = `${event.clientY + 12}px`;

        const dsEl = eventOperateStore.dsContentRef || document.getElementById("designer-ds-content");
        if (!dsEl) {
            document.body.style.cursor = 'grabbing';
            return;
        }
        const drop = getMainCanvasDropPoint({x: event.clientX, y: event.clientY}, dsEl, event.target);
        document.body.style.cursor = drop?.within ? 'grabbing' : 'not-allowed';
    }, []);

    const handleMouseUp = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;

        const dsEl = eventOperateStore.dsContentRef || document.getElementById("designer-ds-content");
        if (dsEl) {
            const drop = getMainCanvasDropPoint({x: event.clientX, y: event.clientY}, dsEl, event.target);
            if (drop?.within)
                addItem("BaseImage", [drop.position.x, drop.position.y], current.url, current.hash);
        }

        stopDraggingRef.current();
    }, []);

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

    const startDragging = (url: string, name: string, hash?: string) => {
        stopDragging();

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
        dragRef.current = { url, hash, ghost };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseup', handleMouseUp, true);
    };

    const getImageList = () => {
        baseApi.getImageSourceList().then((data) => {
            setImageList(data);
        });
    }

    useEffect(() => {
        getImageList();
        return () => {
            stopDragging();
        };
    }, [stopDragging]);

    const confirmDel = (imageId: string) => {
        globalModal.modalApi?.confirm({
            title: "确认删除吗?",
            content: "可能会导致已经使用的图片组件失效!",
            okText: "是",
            cancelText: "否",
            onOk: () => {
                ServerOperator.delImageSource(imageId).then((data) => {
                    if (data) {
                        getImageList();
                        globalMessage.messageApi?.success("已删除")
                    }
                });
            },
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
