/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Delete, Search} from "@icon-park/react";
import {observer} from "mobx-react";
import './TemplateLib.less';
import {useCallback, useEffect, useRef, useState} from "react";
import baseApi from "@/api/engineering/BaseApi.ts";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import {Input} from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import {globalMessage} from "@datavisool/ui";
import DesignerPanelHeader from '../panel-header/DesignerPanelHeader';
import {getMainCanvasDropPoint} from "@/designer/workspace/viewport/ArtboardDropTarget.ts";

const TemplateLib = observer(() => {

    const [data, setData] = useState<{ id: string, name: string, description?: string, coverUrl?: string }[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const activeSearchRef = useRef('');
    const requestVersionRef = useRef(0);
    const dragRef = useRef<{
        templateId: string;
        templateName: string;
        coverUrl?: string;
        ghost: HTMLDivElement;
    } | null>(null);
    const stopDraggingRef = useRef<() => void>(() => undefined);

    const useTemplate = useCallback((templateId: string, position = [0, 0]) => {
        baseApi.getTemplate(templateId).then(response => {
            const templateInfo = JSON.parse(response.templateJson);
            if (templateInfo && templateInfo.layers) {
                //恢复组件位置
                Object.keys(templateInfo.layers).forEach(layerId => {
                    const layer = templateInfo.layers[layerId];
                    if (layer && layer.type !== 'group') {
                        layer.x = Math.round(position[0] + (layer?.x ?? 0));
                        layer.y = Math.round(position[1] + (layer?.y ?? 0));
                    }
                });
                historyRecordOperateProxy.doUseTemplate(templateInfo);
            }
        }).catch(() => {
            globalMessage.messageApi?.error('模板添加失败');
        });
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

    const handleMouseUp = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;

        const dsEl = eventOperateStore.dsContentRef || document.getElementById("designer-ds-content");
        if (dsEl) {
            const drop = getMainCanvasDropPoint({x: event.clientX, y: event.clientY}, dsEl, event.target);
            if (drop?.within)
                useTemplate(current.templateId, [drop.position.x, drop.position.y]);
        }

        stopDraggingRef.current();
    }, [useTemplate]);

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
        window.removeEventListener('mouseup', handleMouseUp, true);
    }, [handleMouseMove, handleMouseUp]);

    useEffect(() => {
        stopDraggingRef.current = stopDragging;
    }, [stopDragging]);

    const startDragging = useCallback((templateId: string, templateName: string, coverUrl?: string) => {
        stopDragging();

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
        dragRef.current = {templateId, templateName, coverUrl, ghost};
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseup', handleMouseUp, true);
    }, [handleMouseMove, handleMouseUp, stopDragging]);

    // 删除模板
    const handleDeleteTemplate = (templateId: string, templateName: string) => {
        globalModal.modalApi?.confirm({
            title: '确认删除',
            content: `确定要删除模板 "${templateName}" 吗？此操作不可恢复。`,
            okText: '确认',
            cancelText: '取消',
            okType: 'danger',
            onOk: () => {
                baseApi.deleteTemplate([templateId]).then((res) => {
                    if (res) {
                        loadTemplateList()
                        globalMessage.messageApi?.success('删除成功');
                    } else
                        globalMessage.messageApi?.error('删除失败');
                });
            }
        });
    }

    const loadTemplateList = () => {
        const version = ++requestVersionRef.current;
        baseApi.getTemplateList(activeSearchRef.current).then(templates => { if (version === requestVersionRef.current) setData(templates); });
    }


    useEffect(() => {
        loadTemplateList();
        window.addEventListener('datavisool-template-created', loadTemplateList);

        return () => {
            window.removeEventListener('datavisool-template-created', loadTemplateList);
            stopDraggingRef.current();
        };
    }, []);

    return (
        <div className={'template-lib'}>
            <DesignerPanelHeader title="模板库"/>
            <div className={'template-search'}>
                <Input placeholder={"搜索模板"}
                       allowClear
                       prefix={<Search size={16} strokeWidth={1.5}/>}
                       value={searchValue}
                       onChange={value => { setSearchValue(value); if (!value) { activeSearchRef.current = ''; loadTemplateList(); } }}
                       onPressEnter={e => { activeSearchRef.current = e.currentTarget.value.trim(); loadTemplateList(); }}/>
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
