/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type TemplateLibraryStore from './TemplateLibraryStore.ts';
import {Delete, Search} from "@icon-park/react";
import {observer} from "mobx-react";
import './TemplateLib.less';
import {useCallback, useEffect, useRef, useState} from "react";
import baseApi from "@/api/engineering/BaseApi.ts";
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import {Input} from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import {globalMessage} from "@datavisool/ui";
import DesignerPanelHeader from '@/shared/components/panel-header/DesignerPanelHeader';

interface TemplateLibraryLifecycle {
    isActive(): boolean;
    isAccepting(): boolean;
    registerPauseCleanup(cleanup: () => void): () => void;
    trackTask<T>(task: Promise<T>): Promise<T>;
}

const TemplateLib = observer(({canvas, onClose, store, lifecycle}: {canvas: EditorCanvasService; onClose(): void; store: TemplateLibraryStore; lifecycle: TemplateLibraryLifecycle}) => {

    const [data, setData] = useState<{ id: string, name: string, description?: string, coverUrl?: string }[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const scene = useEditorScene();
    const deleteModalRef = useRef<string>();
    const activeSearchRef = useRef('');
    const requestVersionRef = useRef(0);
    const dragRef = useRef<{
        templateId: string;
        templateName: string;
        coverUrl?: string;
        sceneVersion: number;
        ghost: HTMLDivElement;
    } | null>(null);
    const stopDraggingRef = useRef<() => void>(() => undefined);
    const handleMouseUpRef = useRef<(event: MouseEvent) => void>(() => undefined);
    const handleMouseUpEvent = useCallback((event: MouseEvent) => handleMouseUpRef.current(event), []);

    const useTemplate = useCallback((templateId: string, position = [0, 0], expectedSceneVersion?: number) => {
        const sceneVersion = expectedSceneVersion ?? scene?.version;
        if (!lifecycle.isAccepting() || sceneVersion === undefined || !canvas.isSceneActive(sceneVersion)) return;
        const insert = async () => {
            const response = await baseApi.getTemplate(templateId);
            if (!lifecycle.isActive() || !canvas.isSceneActive(sceneVersion)) return;
            const templateInfo = JSON.parse(response.templateJson);
            if (templateInfo && templateInfo.layers) {
                Object.keys(templateInfo.layers).forEach(layerId => {
                    const layer = templateInfo.layers[layerId];
                    if (layer && layer.type !== 'group') {
                        layer.x = Math.round(position[0] + (layer?.x ?? 0));
                        layer.y = Math.round(position[1] + (layer?.y ?? 0));
                    }
                });
                if (lifecycle.isActive() && canvas.isSceneActive(sceneVersion)) canvas.insertTemplate(templateInfo);
            }
        };
        void lifecycle.trackTask(insert()).catch(() => {
            if (lifecycle.isActive()) globalMessage.messageApi?.error('模板添加失败');
        });
    }, [canvas, lifecycle, scene?.version]);

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
        if (drop?.within)
            useTemplate(current.templateId, [drop.position.x, drop.position.y], current.sceneVersion);

        stopDraggingRef.current();
    }, [useTemplate, canvas]);
    handleMouseUpRef.current = handleMouseUp;

    const stopDragging = useCallback(() => {
        const current = dragRef.current;
        if (!current) return;
        try {
            current.ghost.remove();
        } catch (e) {
            console.error('[TemplateLib] remove drag ghost failed', e);
        }
        dragRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMove, true);
        window.removeEventListener('mouseup', handleMouseUpEvent, true);
    }, [handleMouseMove, handleMouseUpEvent]);

    useEffect(() => {
        stopDraggingRef.current = stopDragging;
    }, [stopDragging]);

    useEffect(() => {
        stopDraggingRef.current();
    }, [scene?.version]);

    const startDragging = useCallback((templateId: string, templateName: string, coverUrl?: string) => {
        stopDragging();
        const sceneVersion = scene?.version;
        if (!lifecycle.isAccepting() || sceneVersion === undefined || !canvas.isSceneActive(sceneVersion)) return;

        const ghost = document.createElement('div');
        ghost.style.position = 'fixed';
        ghost.style.left = '0';
        ghost.style.top = '0';
        ghost.style.zIndex = '99999';
        ghost.style.pointerEvents = 'none';
        ghost.style.background = 'var(--bg-surface-2)';
        ghost.style.color = 'var(--text-primary)';
        ghost.style.border = '1px solid var(--border-default)';
        ghost.style.borderRadius = 'var(--radius-lg)';
        ghost.style.padding = '8px';
        ghost.style.display = 'flex';
        ghost.style.gap = '8px';
        ghost.style.alignItems = 'center';
        ghost.style.maxWidth = '260px';
        ghost.style.boxShadow = 'var(--shadow-float)';

        if (coverUrl) {
            const img = document.createElement('img');
            img.src = coverUrl;
            img.style.width = '48px';
            img.style.height = '48px';
            img.style.objectFit = 'contain';
            img.style.background = 'rgba(255, 255, 255, 0.06)';
            img.style.borderRadius = '6px';
            ghost.appendChild(img);
        }

        const text = document.createElement('div');
        text.textContent = templateName;
        text.style.fontSize = '12px';
        text.style.lineHeight = '16px';
        ghost.appendChild(text);

        document.body.appendChild(ghost);
        dragRef.current = {templateId, templateName, coverUrl, sceneVersion, ghost};
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseup', handleMouseUpEvent, true);
    }, [handleMouseMove, handleMouseUpEvent, stopDragging, lifecycle, scene?.version, canvas]);

    // 删除模板
    const handleDeleteTemplate = (templateId: string, templateName: string) => {
        if (!lifecycle.isAccepting()) return;
        deleteModalRef.current = globalModal.modalApi?.confirm({
            title: '确认删除',
            content: `确定要删除模板 "${templateName}" 吗？此操作不可恢复。`,
            okText: '确认',
            cancelText: '取消',
            okType: 'danger',
            onOk: async () => {
                if (!lifecycle.isAccepting()) return false;
                try {
                    const deleted = await lifecycle.trackTask((async () => {
                        const res = await baseApi.deleteTemplate([templateId]);
                        if (res) await loadTemplateList();
                        return res;
                    })());
                    if (lifecycle.isActive()) {
                        if (deleted) globalMessage.messageApi?.success('删除成功');
                        else globalMessage.messageApi?.error('删除失败');
                    }
                    return deleted;
                } catch {
                    if (lifecycle.isActive()) globalMessage.messageApi?.error('删除失败');
                    return false;
                }
            },
            afterClose: () => { deleteModalRef.current = undefined; },
        });
    }

    const loadTemplateList = useCallback(async () => {
        const version = ++requestVersionRef.current;
        try {
            const templates = await baseApi.getTemplateList(activeSearchRef.current);
            if (lifecycle.isActive() && version === requestVersionRef.current) setData(templates);
            return templates;
        } catch (error) {
            if (lifecycle.isActive() && version === requestVersionRef.current) console.error('加载模板列表失败', error);
            return undefined;
        }
    }, [lifecycle]);


    useEffect(() => {
        loadTemplateList();
        const unsubscribe = store.subscribe(loadTemplateList);
        const unregisterPauseCleanup = lifecycle.registerPauseCleanup(() => stopDraggingRef.current());

        return () => {
            unsubscribe();
            requestVersionRef.current += 1;
            unregisterPauseCleanup();
            stopDraggingRef.current();
            if (deleteModalRef.current) globalModal.modalApi?.destroy(deleteModalRef.current);
        };
    }, [loadTemplateList, store, lifecycle]);

    return (
        <div className={'template-lib'}>
            <DesignerPanelHeader onClose={onClose} title="模板库"/>
            <div className={'template-search'}>
                <Input placeholder={"搜索模板"}
                       allowClear
                       prefix={<Search size={16} strokeWidth={1.5}/>}
                       value={searchValue}
                       onChange={value => { setSearchValue(value); if (!value && lifecycle.isAccepting()) { activeSearchRef.current = ''; loadTemplateList(); } }}
                       onPressEnter={e => { if (!lifecycle.isAccepting()) return; activeSearchRef.current = e.currentTarget.value.trim(); loadTemplateList(); }}/>
            </div>
            <div className={'template-lib-body'} id="template-lib-body">
                {
                    data.length > 0 ? data.map(item => (
                        <div data-id={item.id}
                             className='template-item' role="button" tabIndex={0}
                             onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); useTemplate(item.id); } }}
                             onMouseDown={(e) => {
                                 if (e.button !== 0) return;
                                 if ((e.target as HTMLElement).closest('.template-delete-btn')) return;
                                 e.preventDefault();
                                 e.stopPropagation();
                                 startDragging(item.id, item.name, item.coverUrl);
                                 handleMouseMove(e.nativeEvent);
                             }}
                             onDoubleClick={() => useTemplate(item.id)}
                             key={item.id}>
                            {/* 预览区域 */}
                            {item.coverUrl && <div className="template-preview">
                                <div className="preview-placeholder">
                                    <img src={item.coverUrl} alt={`${item.name}预览`} className="preview-image"/>
                                </div>
                            </div>}

                            {/* 内容区域 */}
                            <div className="template-content">
                                <div className="template-header">
                                    <div className="template-name">{item.name}</div>
                                </div>

                                <div className="template-footer">
                                    <div className="template-tag">
                                        {item.description || '暂无描述'}
                                    </div>
                                    <button type="button"
                                         className="template-delete-btn"
                                         aria-label={`删除模板「${item.name}」`}
                                         onClick={(e) => {
                                             e.stopPropagation();
                                             handleDeleteTemplate(item.id, item.name);
                                         }}>
                                        <Delete className="delete-icon" size={16} strokeWidth={1.5}/>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className={'template-empty'}>
                            <div className={'template-empty-title'}>暂无模板</div>
                            <div className={'template-empty-desc'}>选中画布中的组件，右键选择「存为模板」</div>
                        </div>
                    )
                }
            </div>
        </div>
    )
})

export default TemplateLib;
