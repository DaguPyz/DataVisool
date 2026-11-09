/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import { useCallback, useEffect, useRef, useState } from "react";
import './VideoSource.less';
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {IdGenerate} from "@datavisool/sdk";
import {Input} from "@datavisool/ui";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import { Close, PlayOne, Search } from "@icon-park/react";
import baseApi from "@/api/engineering/BaseApi.ts";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import { ILayerItem } from "@datavisool/sdk/types";
import { BaseVideoComponentProps } from "@/comps/builtin/base-video/BaseVideoController.ts";
import { globalMessage } from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";
import {getMainCanvasDropPoint} from "@/designer/workspace/viewport/ArtboardDropTarget.ts";

export default function VideoSource() {
    const [videoList, setVideoList] = useState<any[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const activeSearchRef = useRef('');
    const requestVersionRef = useRef(0);
    const dragRef = useRef<{
        url: string;
        ghost: HTMLDivElement;
    } | null>(null);

    const resolveVideoUrl = useCallback((url?: string) => {
        if (!url) return url;
        return AssetUrlUtil.toLoadableUrl(url);
    }, []);

    const addItem = useCallback((compKey: string, position = [0, 0], url: string) => {
        const { elemConfigs } = window.DATAVISOOL_ENV.currentManager.layerManager;
        const { setAddRecordCompId } = eventOperateStore;
        const definition = DesignerLoader.definitionMap[compKey];
        if (!definition) {
            globalMessage.messageApi?.error("未找到 BaseVideo 组件定义");
            return;
        }
        const { compName, width = 400, height = 225 } = definition.getBaseInfo();
        const id = IdGenerate.generateId();
        const movableItem: ILayerItem = {
            name: compName,
            type: compKey,
            x: Math.round(position[0]),
            y: Math.round(position[1]),
            id,
            lock: false,
            hide: false,
            width,
            height,
        }
        setAddRecordCompId(movableItem.id!)
        historyRecordOperateProxy.doAdd(movableItem);

        const initConfig: BaseVideoComponentProps = definition.getInitConfig();
        if (!initConfig.style) initConfig.style = {};
        // 假设 BaseVideoComponentStyle 中有 src 属性，或者类似的 url 属性
        // 根据 BaseVideoController 的类型推断，这里我们动态设置 src
        (initConfig.style as any).src = url;
        initConfig['base']!['id'] = id;

        elemConfigs![id] = initConfig;
    }, []);

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

    const handleMouseUpRef = useRef<(event: MouseEvent) => void>(() => {});

    const stopDragging = useCallback(() => {
        const current = dragRef.current;
        if (!current) return;
        try {
            current.ghost.remove();
        } catch (e) {
            console.error('[VideoSource] remove drag ghost failed', e);
        }
        dragRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMove, true);
        window.removeEventListener('mouseup', handleMouseUpRef.current, true);
    }, [handleMouseMove]);

    const handleMouseUp = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;

        const dsEl = eventOperateStore.dsContentRef || document.getElementById("designer-ds-content");
        if (dsEl) {
            const drop = getMainCanvasDropPoint({x: event.clientX, y: event.clientY}, dsEl, event.target);
            if (drop?.within) {
                const src = resolveVideoUrl(current.url) || current.url;
                addItem("BaseVideo", [drop.position.x, drop.position.y], src);
            }
        }

        stopDragging();
    }, [addItem, resolveVideoUrl, stopDragging]);

    handleMouseUpRef.current = handleMouseUp;

    const startDragging = useCallback((url: string, name: string) => {
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
        text.textContent = name || '未命名视频';
        text.style.fontSize = '12px';
        text.style.lineHeight = '16px';
        ghost.appendChild(text);

        document.body.appendChild(ghost);
        dragRef.current = {url, ghost};
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseup', handleMouseUpRef.current, true);
    }, [handleMouseMove, stopDragging]);

    const getVideoList = useCallback((name?: string) => {
        const requestVersion = ++requestVersionRef.current;
        baseApi.getVideoSourceList(name).then((data) => {
            if (requestVersion === requestVersionRef.current) setVideoList(data);
        });
    }, []);

    const handleDelete = useCallback((id: string) => {
        globalModal.modalApi?.confirm({
            title: "确定删除该视频吗？",
            content: "可能会导致已经使用的视频组件失效!",
            okText: "是",
            cancelText: "否",
            onOk: () => {
                baseApi.delVideoSource(id).then(res => {
                    if (res) {
                        globalMessage.messageApi?.success('删除成功');
                        getVideoList(activeSearchRef.current);
                    }
                });
            },
        });
    }, [getVideoList]);

    useEffect(() => {
        getVideoList();
        return () => {
            stopDragging();
        };
    }, [getVideoList, stopDragging]);

    return <div className={'video-source'}>
        <div className={'video-source-search'}>
            <Input
                placeholder="搜索视频"
                inputSize="sm"
                allowClear
                prefix={<Search size={14} fill="currentColor"/>}
                value={searchValue}
                onPressEnter={(e) => { activeSearchRef.current = e.currentTarget.value.trim(); getVideoList(activeSearchRef.current); }}
                onChange={(value) => {
                    setSearchValue(value);
                    if (!value) { activeSearchRef.current = ''; getVideoList(); }
                }}
            />
        </div>
        <div className={'video-source-list'} id={'video-source-list'}>
            {
                videoList.map((item, index) => {
                    const videoSrc = resolveVideoUrl(item.url);
                    return <div className={'video-source-item droppable-element'} key={index} role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); addItem('BaseVideo', [0, 0], resolveVideoUrl(item.url) || item.url); } }}
                        onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            startDragging(item.url, item.name);
                            handleMouseMove(e.nativeEvent);
                        }}
                        onDoubleClick={() => addItem("BaseVideo", [0, 0], resolveVideoUrl(item.url) || item.url)}
                        data-url={item.url}>
                        <div className={'video-source-item-header'}>
                            <div className={'vsi-title'} title={item.name}>{item.name || '未命名视频'}</div>
                            <div className={'vsi-close'} onMouseDown={(e) => e.stopPropagation()} onClick={() => handleDelete(item.id)}>
                                <Close theme="outline" size={14} />
                            </div>
                        </div>
                        <div className={'video-source-item-body'}>
                            <video src={videoSrc} muted preload="metadata" />
                            <div className={'video-overlay'}>
                                <PlayOne theme="filled" size="24" fill="#fff" />
                            </div>
                        </div>
                    </div>
                })
            }
        </div>
    </div>;
}
