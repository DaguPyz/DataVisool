/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import { useCallback, useEffect, useRef, useState } from "react";
import './VideoSource.less';
import {IdGenerate} from "@datavisool/sdk";
import {Input} from "@datavisool/ui";
import { Close, PlayOne, Search } from "@icon-park/react";
import baseApi from "@/api/engineering/BaseApi.ts";
import { ILayerItem } from "@datavisool/sdk/types";
import { globalMessage } from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";
import type {ResourceLibraryLifecycle} from '../ResourceLibraryLifecycle.ts';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';

export default function VideoSource({canvas, catalog, lifecycle}: {canvas: EditorCanvasService; catalog: DesignerCatalog; lifecycle: ResourceLibraryLifecycle}) {
    const scene = useEditorScene();
    const [videoList, setVideoList] = useState<any[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const mountedRef = useRef(false);
    const activeSearchRef = useRef('');
    const requestVersionRef = useRef(0);
    const deleteModalRef = useRef<string>();
    const dragRef = useRef<{
        url: string;
        sceneVersion: number;
        ghost: HTMLDivElement;
    } | null>(null);

    const resolveVideoUrl = useCallback((url?: string) => {
        if (!url) return url;
        return AssetUrlUtil.toLoadableUrl(url);
    }, []);

    const addItem = useCallback((compKey: string, position = [0, 0], url: string) => {
        if (!lifecycle.isAccepting()) return;
        const component = catalog.getComponent(compKey);
        const initConfig = catalog.createInitialConfig(compKey);
        if (!component || !initConfig) {
            globalMessage.messageApi?.error("未找到 BaseVideo 组件定义");
            return;
        }
        const {compName, width = 400, height = 225} = component.baseInfo;
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

        if (!initConfig.style) initConfig.style = {};
        // 假设 BaseVideoComponentStyle 中有 src 属性，或者类似的 url 属性
        // 根据 BaseVideoController 的类型推断，这里我们动态设置 src
        (initConfig.style as Record<string, unknown>).src = url;
        const base = initConfig.base as Record<string, unknown> | undefined;
        if (base) base.id = id;

        canvas.insertLayer(movableItem, {...initConfig});
    }, [canvas, lifecycle]);

    const handleMouseMove = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;
        current.ghost.style.left = `${event.clientX + 12}px`;
        current.ghost.style.top = `${event.clientY + 12}px`;

        const drop = canvas.resolveDrop(event);
        document.body.style.cursor = drop && !drop.within ? 'not-allowed' : 'grabbing';
    }, [canvas]);

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

        const drop = canvas.resolveDrop(event);
        if (lifecycle.isAccepting() && drop?.within && canvas.isSceneActive(current.sceneVersion)) {
            const src = resolveVideoUrl(current.url) || current.url;
            addItem("BaseVideo", [drop.position.x, drop.position.y], src);
        }

        stopDragging();
    }, [addItem, resolveVideoUrl, stopDragging, canvas, lifecycle]);

    handleMouseUpRef.current = handleMouseUp;

    const startDragging = useCallback((url: string, name: string) => {
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
        text.textContent = name || '未命名视频';
        text.style.fontSize = '12px';
        text.style.lineHeight = '16px';
        ghost.appendChild(text);

        document.body.appendChild(ghost);
        dragRef.current = {url, sceneVersion, ghost};
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseup', handleMouseUpRef.current, true);
    }, [handleMouseMove, stopDragging, lifecycle, scene?.version, canvas]);

    const getVideoList = useCallback(async (name?: string, allowPaused = false) => {
        if (!lifecycle.isAccepting() && !allowPaused) return;
        const requestVersion = ++requestVersionRef.current;
        try {
            const data = await baseApi.getVideoSourceList(name);
            if (mountedRef.current && lifecycle.isActive() && requestVersion === requestVersionRef.current) setVideoList(data);
            return data;
        } catch (error) {
            if (mountedRef.current && lifecycle.isActive() && requestVersion === requestVersionRef.current)
                console.error('加载视频资源失败', error);
            return undefined;
        }
    }, [lifecycle]);

    const handleDelete = useCallback((id: string) => {
        if (!lifecycle.isAccepting()) return;
        deleteModalRef.current = globalModal.modalApi?.confirm({
            title: "确定删除该视频吗？",
            content: "可能会导致已经使用的视频组件失效!",
            okText: "是",
            cancelText: "否",
            onOk: async () => {
                if (!lifecycle.isAccepting()) return false;
                const deletion = lifecycle.trackTask((async () => {
                    const res = await baseApi.delVideoSource(id);
                    if (res) {
                        await getVideoList(activeSearchRef.current, true);
                        if (lifecycle.isActive()) globalMessage.messageApi?.success('删除成功');
                    }
                    return res;
                })());
                try { return await deletion; }
                catch (error) {
                    if (lifecycle.isActive()) globalMessage.messageApi?.error('删除失败');
                    return false;
                }
            },
            afterClose: () => { deleteModalRef.current = undefined; },
        });
    }, [getVideoList, lifecycle]);

    useEffect(() => {
        mountedRef.current = true;
        getVideoList();
        const unregisterPauseCleanup = lifecycle.registerPauseCleanup(stopDragging);
        return () => {
            mountedRef.current = false;
            requestVersionRef.current++;
            unregisterPauseCleanup();
            stopDragging();
            if (deleteModalRef.current) globalModal.modalApi?.destroy(deleteModalRef.current);
        };
    }, [getVideoList, stopDragging, lifecycle]);

    useEffect(() => { stopDragging(); }, [scene?.version, stopDragging]);

    return <div className={'video-source'}>
        <div className={'video-source-search'}>
            <Input
                placeholder="搜索视频"
                inputSize="sm"
                allowClear
                prefix={<Search size={14} fill="currentColor"/>}
                value={searchValue}
                       onPressEnter={(e) => { if (!lifecycle.isAccepting()) return; activeSearchRef.current = e.currentTarget.value.trim(); getVideoList(activeSearchRef.current); }}
                onChange={(value) => {
                           if (!lifecycle.isAccepting()) return;
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
