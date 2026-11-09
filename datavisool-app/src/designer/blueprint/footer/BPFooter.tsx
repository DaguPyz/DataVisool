/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useLayoutEffect, useRef, useState} from "react";
import './BPFooter.less';
import BPZoomControls from './BPZoomControls';
import {observer} from "mobx-react";
import {Dropdown, Input, globalModal} from "@datavisool/ui";
import {Check, Copy, Delete, Edit, FileText, More, Plus} from "@icon-park/react";
import bpHistoryRecordOperateProxy from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";

const PageIcon = () => <FileText size={16} strokeWidth={3}
                                theme="multi-color" fill={['currentColor', 'none', 'none', 'none']}
                                aria-hidden="true"/>;

const BPFooter: React.FC = observer(() => {
    const manager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
    const {bpPageMangers, currentPageManager} = manager;
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    const renameTargetRef = useRef<string | null>(null);
    const [editingTabId, setEditingTabId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const activePageId = currentPageManager?.pageId;

    useLayoutEffect(() => {
        const container = tabsContainerRef.current;
        if (!container) return;
        const revealActiveTab = () => {
            const activeTab = container.querySelector<HTMLElement>('.bp-footer-tab.active');
            if (!activeTab) return;
            const viewport = container.getBoundingClientRect();
            const tab = activeTab.getBoundingClientRect();
            if (tab.left < viewport.left) container.scrollLeft -= viewport.left - tab.left;
            else if (tab.right > viewport.right) container.scrollLeft += tab.right - viewport.right;
        };
        revealActiveTab();
        const observer = new ResizeObserver(revealActiveTab);
        observer.observe(container);
        return () => observer.disconnect();
    }, [activePageId, bpPageMangers.length, editingTabId, currentPageManager?.pageName]);

    const handleTabClick = (pageId: string) => {
        if (pageId !== manager.currentPageManager?.pageId)
            manager.loadBpPageContent(pageId);
    };

    const finishRename = () => {
        // Use the page that began editing, even if a blur coincides with a page switch.
        const target = bpPageMangers.find(page => page.pageId === renameTargetRef.current);
        renameTargetRef.current = null;
        if (target && editName.trim()) target.setPageName(editName.trim());
        setEditingTabId(null);
        setEditName('');
    };

    const cancelRename = () => {
        renameTargetRef.current = null;
        setEditingTabId(null);
        setEditName('');
    };

    const activeEditName = (pageId: string) => {
        const target = bpPageMangers.find(page => page.pageId === pageId);
        if (!target) return;
        handleTabClick(pageId);
        renameTargetRef.current = pageId;
        setEditName(target.pageName);
        setEditingTabId(pageId);
    };

    const handleRenameKeyDown = (event: React.KeyboardEvent) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            finishRename();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelRename();
        }
    };

    const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % bpPageMangers.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + bpPageMangers.length) % bpPageMangers.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = bpPageMangers.length - 1;
        else return;
        event.preventDefault();
        event.stopPropagation();
        handleTabClick(bpPageMangers[nextIndex].pageId);
        tabsContainerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
    };

    const addNewPage = () => {
        bpHistoryRecordOperateProxy.doAddPage();
        const page = manager.bpPageMangers.at(-1);
        if (page) handleTabClick(page.pageId);
    };

    const deletePage = (pageId: string) => {
        if (bpPageMangers.length <= 1) return;
        globalModal.modalApi?.confirm({
            title: '删除页面',
            content: '删除后将无法恢复，确认删除吗？',
            onOk: () => {
                if (manager.bpPageMangers.length > 1)
                    bpHistoryRecordOperateProxy.doDelPage(pageId);
            },
            okText: '确定',
            cancelText: '取消',
        });
    };

    const pageItems = bpPageMangers.map(tab => ({
        key: tab.pageId,
        label: <span className={`bp-footer-more-item ${activePageId === tab.pageId ? 'active' : ''}`}>
            <PageIcon/>
            <span className="bp-footer-overview-name" title={tab.pageName}>{tab.pageName}</span>
            {activePageId === tab.pageId && <Check size={14} aria-hidden="true"/>}
        </span>,
        onClick: () => handleTabClick(tab.pageId),
    }));

    return (
        <div className="bp-footer" data-bp-ui>
            <div className="bp-footer-tabs">
                <Dropdown menu={{items: pageItems}} trigger={['click']} placement="topLeft"
                          popupClassName="bp-workspace-popup bp-footer-overview-popup">
                    <button type="button" className="bp-footer-overview" aria-label="页面总览"
                            title={`页面总览 · ${bpPageMangers.length} 个页面`}>
                        <Copy size={17} strokeWidth={3} aria-hidden="true"/>
                        <span className="bp-footer-page-count">{String(bpPageMangers.length).padStart(2, '0')}</span>
                    </button>
                </Dropdown>
                <span className="bp-footer-divider" aria-hidden="true"/>
                <div className="bp-footer-tabs-container" ref={tabsContainerRef} role="tablist" aria-label="蓝图页面">
                    {bpPageMangers.map((tab, index) => {
                        const active = activePageId === tab.pageId;
                        return <div key={tab.pageId} className={`bp-footer-tab ${active ? 'active' : ''}`}>
                            {editingTabId === tab.pageId ? (
                                <div className="bp-footer-tab-rename">
                                    <PageIcon/>
                                    <label className="bp-footer-rename-label" htmlFor="bp-footer-rename-input">页面名称</label>
                                    <Input id="bp-footer-rename-input" autoFocus inputSize="sm" value={editName}
                                           onChange={setEditName} onFocus={event => event.target.select()}
                                           onBlur={finishRename} onKeyDown={handleRenameKeyDown}
                                           className="bp-footer-tab-input"/>
                                </div>
                            ) : (
                                <>
                                    <button type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
                                            className="bp-footer-tab-select" title={tab.pageName}
                                            onClick={() => handleTabClick(tab.pageId)}
                                            onDoubleClick={() => activeEditName(tab.pageId)}
                                            onKeyDown={event => handleTabKeyDown(event, index)}>
                                        <PageIcon/>
                                        <span className="bp-footer-tab-text">{tab.pageName}</span>
                                    </button>
                                    {active && <Dropdown trigger={['click']} placement="topLeft"
                                                         popupClassName="bp-workspace-popup bp-footer-actions-popup"
                                                         menu={{items: [
                                                             {key: 'rename', label: '重命名', icon: <Edit size={16}/>,
                                                                 onClick: () => activeEditName(tab.pageId)},
                                                             {key: 'delete', label: '删除页面', icon: <Delete size={16}/>, danger: true,
                                                                 disabled: bpPageMangers.length <= 1,
                                                                 onClick: () => deletePage(tab.pageId)},
                                                         ]}}>
                                        <button type="button" className="bp-footer-tab-more"
                                                aria-label={`页面操作 ${tab.pageName}`} title="页面操作">
                                            <More size={16} aria-hidden="true"/>
                                        </button>
                                    </Dropdown>}
                                </>
                            )}
                        </div>;
                    })}
                </div>
                <span className="bp-footer-divider" aria-hidden="true"/>
                <button type="button" className="bp-footer-add" aria-label="新增页面" title="新增页面" onClick={addNewPage}>
                    <Plus size={18} strokeWidth={3} aria-hidden="true"/>
                </button>
            </div>
            <BPZoomControls/>
        </div>
    );
});

export default BPFooter;
